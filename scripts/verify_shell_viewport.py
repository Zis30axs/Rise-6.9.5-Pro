#!/usr/bin/env python3
"""Isolated DOM/CSS browser regression, NOT a full game or iPhone acceptance test.
Needs Python playwright, Chromium and the repo's local TypeScript (or tsc on PATH).
"""
import argparse
import hashlib
import json
import re
import shutil
import subprocess
import tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
FRONT = ROOT / 'src/frontend'

def overlap(a, b):
    return a['x'] < b['right']-.5 and a['right'] > b['x']+.5 and a['y'] < b['bottom']-.5 and a['bottom'] > b['y']+.5

def check_layout(m, width, height, top=0, safe=0):
    assert abs(m['root']['y']-top)<1, ('root top',m)
    assert abs(m['root']['height']-height)<1, ('root height',m)
    assert abs(m['shell']['height']-height)<1, ('shell height',m)
    assert not m['overflow'], ('horizontal overflow',m)
    assert m['rescueCount']==0, ('independent rescue must not exist',m)
    for label in ['chat','input','send','dock']:
        b=m[label]
        assert b['x']>=-.5 and b['right']<=width+.5 and b['y']>=top-.5 and b['bottom']<=top+height+.5,(label,m)
    assert not overlap(m['chat'],m['title']), ('chat switch/title overlap',m)
    assert m['input']['bottom'] <= m['reading']['bottom']-2, ('input clipped by reading',m)
    assert m['send']['bottom'] <= m['reading']['bottom']-2, ('send clipped by reading',m)
    if width <= 760:
        assert m['reading']['bottom']+8 <= m['dock']['y'], ('dock/read overlap',m)
        assert m['dock']['bottom'] <= top+height-max(12,safe)+.5, ('unsafe dock bottom',m)
        if m['panel']:
            assert m['panel']['bottom'] <= m['dock']['y'] - 4, ('panel bottom obstructed by dock',m)
    for b in m['nav']:
        assert b['x']>=-.5 and b['right']<=width+.5 and b['bottom']<=top+height+.5, ('nav clipped',m)

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--chromium', default=shutil.which('chromium'))
    parser.add_argument('--output', type=Path, default=ROOT/'outputs/mobile-viewport')
    args=parser.parse_args(); args.output.mkdir(parents=True,exist_ok=True)
    local_tsc=ROOT/'node_modules/.bin/tsc'
    tsc=str(local_tsc) if local_tsc.exists() else shutil.which('tsc')
    if not tsc: raise SystemExit('TypeScript compiler missing: npm ci or provide tsc on PATH.')
    with tempfile.TemporaryDirectory() as folder:
        subprocess.run([tsc,'--target','ES2022','--module','ES2022','--lib','ES2022,DOM','--strict','--skipLibCheck','--outDir',folder,str(FRONT/'shell-viewport.ts')],check=True)
        module=(Path(folder)/'shell-viewport.js').read_text()
    # Preserve actual cascade order: novel-mode is imported before shell.css rules.
    base=(FRONT/'novel-mode.css').read_text()+ '\n'+ re.sub(r"^@import[^\n]*",'',(FRONT/'shell.css').read_text(),flags=re.M)
    css=(FRONT/'shell-viewport.css').read_text()
    fixture=(ROOT/'tests/fixtures/shell-viewport.html').read_text()
    script=module.replace('export ', '')+'\nwindow.bindShellViewport = bindShellViewport;'
    cases=[{'width':w,'height':h,'mode':mode} for w,h in [(1440,900),(1280,800),(390,844),(320,568)] for mode in ['novel','scene']]
    cases += [
      dict(width=390,height=844,visible=744,mode='novel',safe=34),
      dict(width=390,height=844,visible=744,mode='novel',safe=34,transform='translateY(59px)'),
      dict(width=320,height=568,visible=468,mode='novel',safe=34,transform='translateY(59px)'),
      dict(width=390,height=844,visible=360,mode='novel',safe=0,top=80),
      dict(width=320,height=568,visible=300,mode='novel',safe=0),
    ]
    results=[]
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path=args.chromium,headless=True,args=['--no-sandbox'])
        for index,c in enumerate(cases):
            page=browser.new_page(viewport={'width':c['width'],'height':c['height']})
            errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
            page.set_content(fixture)
            page.evaluate('(v) => window.mockViewport(v.height,v.top)',{'height':c.get('visible',c['height']),'top':c.get('top',0)})
            page.evaluate('v=>window.mountFixture(v.css,v.mode,v.transform)',{'css':base,'mode':c['mode'],'transform':c.get('transform','')})
            baseline=page.evaluate('layoutMetrics()')
            page.add_script_tag(content=script)
            page.evaluate('(v) => {const root=document.querySelector("[data-unread-city-root]");root.style.setProperty("--uc-safe-bottom",v.safe+"px"); window.lease=bindShellViewport(window,v.css);}',{'safe':c.get('safe',0),'css':css})
            page.wait_for_timeout(100)
            page.evaluate('window.dispatchEvent(new Event("resize"))')
            page.wait_for_timeout(60)
            metrics=page.evaluate('layoutMetrics()')
            check_layout(metrics,c['width'],c.get('visible',c['height']),c.get('top',0),c.get('safe',0))
            page.locator('textarea').fill('测试草稿，不能被底栏挡住。')
            page.locator('button[type=submit]').click()
            assert page.locator('body').get_attribute('data-submitted')=='测试草稿，不能被底栏挡住。'
            # Pointer hit-testing, not just bounding boxes.
            for label in ['手机','地图','地点','日程','背包','状态']:
                page.locator(f'.tool-dock button[aria-label="{label}"]').click()
            page.evaluate('openFixturePanel()')
            page.wait_for_timeout(70)
            panel_metrics=page.evaluate('layoutMetrics()')
            check_layout(panel_metrics,c['width'],c.get('visible',c['height']),c.get('top',0),c.get('safe',0))
            panel=page.locator('.floating-window .window-content')
            panel.evaluate('(el)=>{el.scrollTop=el.scrollHeight;}')
            last=panel.locator('button').last.bounding_box()
            panel_box=page.locator('.floating-window').bounding_box()
            assert last['y']+last['height'] <= panel_box['y']+panel_box['height']+1, ('last menu control occluded',c,last,panel_box)
            screenshot=f'{index+1:02d}-{c["width"]}x{c["height"]}-{c["mode"]}.png'
            page.screenshot(path=str(args.output/screenshot))
            page.locator('.floating-window').evaluate('(el)=>el.remove()')
            page.locator('.novel-dialogue-text').evaluate('(el)=>{el.scrollTop=el.scrollHeight;}')
            # Full-text presentation remains clear of both fixed controls.
            if c.get('visible',c['height'])>=470:
                page.locator('.reading-layer').evaluate('(el)=>el.classList.add("reading-expanded")')
                page.wait_for_timeout(50)
                check_layout(page.evaluate('layoutMetrics()'),c['width'],c.get('visible',c['height']),c.get('top',0),c.get('safe',0))
            page.locator('[aria-label="切换聊天并恢复原生界面"]').click()
            assert page.locator('[data-unread-city-root]').count()==0
            assert page.locator('[data-unread-city-rescue]').count()==0
            page.locator('#native-input').fill('恢复后仍可输入')
            assert page.locator('#native-input').input_value()=='恢复后仍可输入'
            assert not errors,errors
            results.append({'case':c,'passed':True,'baseline':baseline,'after':metrics,'screenshot':screenshot})
            page.close()
        browser.close()
    report={'scope':'Isolated real Chromium DOM/CSS layout regression. Not full bundle, not TauriTavern/iPhone hardware.','browser':'Chromium','passed':len(results),'cases':results,'source_sha256':{str(f.relative_to(ROOT)):hashlib.sha256(f.read_bytes()).hexdigest() for f in [FRONT/'shell-viewport.ts',FRONT/'shell-viewport.css',FRONT/'shell.css',FRONT/'novel-mode.css']}}
    (args.output/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
    print(json.dumps({'passed':len(results),'report':str(args.output/'report.json')},ensure_ascii=False))
if __name__=='__main__':main()
