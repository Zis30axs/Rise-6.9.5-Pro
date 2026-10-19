/** Isolated production-CSS regression; no bundle, model API or private data. */
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { chromium } from '@playwright/test';
import { createFixture, measureFixture } from './mobile-layout-fixture.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'outputs/mobile-layout-regression');
mkdirSync(output, { recursive: true });
const css = file => readFileSync(file, 'utf8').replace(/@import\s+['"]([^'"]+)['"];?/g,
  (_match, name) => css(path.resolve(path.dirname(file), name)));
const baselineCss = css(path.join(root, 'src/frontend/shell.css'));
const patchCss = css(path.join(root, 'src/frontend/viewport-layout.css'));
const code = ts.transpileModule(readFileSync(path.join(root, 'src/frontend/shell-viewport.ts'), 'utf8'),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText.replace(/export /g, '');
const browser = await chromium.launch({ ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), headless: true });
const page = await browser.newPage();
const results = [], errors = [];
page.on('pageerror', error => errors.push(error.message));
async function install({ mode = 'novel', safeBottom = 0, safeTop = 0, nativeHeight = 0, visualHeight = 0, offset = 0, transformed = false } = {}) {
  await page.goto('about:blank');
  await page.setContent('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unread City layout regression fixture</title>');
  await page.evaluate(({ nativeHeight, visualHeight, offset, transformed }) => {
    if (nativeHeight) Object.defineProperty(window, 'innerHeight', { configurable: true, value: nativeHeight });
    if (visualHeight) {
      const visual = new EventTarget(); Object.assign(visual, { width: innerWidth, height: visualHeight, offsetTop: offset, offsetLeft: 0, scale: 1 });
      Object.defineProperty(window, 'visualViewport', { configurable: true, value: visual });
    }
    if (transformed) { document.documentElement.style.transform = 'translateY(58px)'; document.documentElement.style.height = '0px'; }
  }, { nativeHeight, visualHeight, offset, transformed });
  await page.addScriptTag({ content: code + '\nwindow.bindShellViewport=bindShellViewport;\n' + createFixture.toString() + '\n' + measureFixture.toString() + '\nwindow.createFixture=createFixture;window.measureFixture=measureFixture;' });
  await page.evaluate(args => { window.fixture = window.createFixture(args); }, { baselineCss, patchCss, mode, safeBottom, safeTop });
}
const measure = () => page.evaluate(() => window.measureFixture(window.fixture));
async function apply() { await page.evaluate(() => window.fixture.apply(window.bindShellViewport)); await page.waitForTimeout(100); }
function check(value, mobile = true, keyboard = false) {
  assert.equal(value.overlap, false, 'Restore must not overlap input/send');
  assert(value.inputInView && value.sendInView && value.rescueInView);
  assert(value.inputInsidePanel && value.sendHit);
  if (!keyboard) { assert(value.dockInView); assert(value.buttons.every(button => button.inView)); assert.equal(value.dockOverlap, false); }
  if (mobile) assert(value.readingAboveRescue, 'Reading must reserve the emergency row');
}
try {
  await page.setViewportSize({ width: 390, height: 844 });
  await install({ nativeHeight: 780, visualHeight: 780 });
  const before = await measure(); assert(before.overlap && !before.dockInView, 'Fixture must reproduce both original symptoms');
  await page.screenshot({ path: path.join(output, 'before.png') });
  await apply(); const after = await measure(); check(after);
  results.push({ name: 'native-height-mismatch', before, after });
  for (const [width, height] of [[1440, 900], [1280, 800], [390, 844], [320, 568]]) {
    for (const mode of ['scene', 'novel']) {
      await page.setViewportSize({ width, height });
      await install({ mode, safeBottom: width < 761 ? 34 : 0, safeTop: width < 761 ? 24 : 0 });
      await apply(); check(await measure(), width < 761);
      await page.locator('textarea').fill('未发送草稿保留'); await page.locator('.composer > button').click();
      assert.equal((await measure()).submissions, 1);
      await page.evaluate(() => { const s = window.fixture.shadow; s.querySelector('.novel-speech').textContent = '长故事。'.repeat(1000); s.querySelector('.novel-dialogue-text').scrollTop = 100; });
      assert(await page.evaluate(() => window.fixture.shadow.querySelector('.novel-dialogue-text').scrollTop > 0));
      const geometry = await measure(); check(geometry, width < 761);
      await page.screenshot({ path: path.join(output, `${mode}-${width}x${height}.png`) });
      results.push({ name: `${mode}-${width}x${height}`, geometry });
      await page.locator('[data-unread-city-rescue]').click();
      assert.equal(await page.locator('[data-unread-city-root]').count(), 0);
      assert.equal(await page.locator('#native-input').inputValue(), '原生草稿不动');
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await install({ nativeHeight: 780, visualHeight: 780, transformed: true }); await apply(); check(await measure());
  results.push({ name: 'translated-zero-height-host', geometry: await measure() });
  await install({ visualHeight: 844 }); await apply();
  await page.locator('textarea').fill('键盘切换中的草稿');
  await page.evaluate(() => { Object.assign(visualViewport, { height: 390, offsetTop: 180 }); visualViewport.dispatchEvent(new Event('resize')); });
  await page.waitForTimeout(50); check(await measure(), true, true);
  results.push({ name: 'simulated-keyboard-open', geometry: await measure() });
  await page.evaluate(() => { Object.assign(visualViewport, { height: 844, offsetTop: 0 }); visualViewport.dispatchEvent(new Event('resize')); });
  await page.waitForTimeout(50); const closed = await measure(); check(closed);
  assert.equal(closed.inputValue, '键盘切换中的草稿'); results.push({ name: 'simulated-keyboard-close', geometry: closed });
  for (const [width, height] of [[390, 844], [320, 568]]) {
    await page.setViewportSize({ width, height }); await install({ safeBottom: 34 }); await apply();
    const geometry = await page.evaluate(() => {
      const dialog = document.createElement('section'); dialog.className = 'floating-window';
      dialog.innerHTML = '<header class="window-heading">地图 / 面板</header><div class="window-content">' + '长面板内容。'.repeat(600) + '</div>';
      window.fixture.shadow.querySelector('.uc-shell').append(dialog);
      return { bottom: dialog.getBoundingClientRect().bottom, rescueTop: window.fixture.rescue.getBoundingClientRect().top,
        scroll: dialog.lastElementChild.scrollHeight > dialog.lastElementChild.clientHeight };
    });
    assert(geometry.bottom <= geometry.rescueTop && geometry.scroll); results.push({ name: `dialog-${width}`, geometry });
  }
  assert.deepEqual(errors, []);
  writeFileSync(path.join(output, 'results.json'), JSON.stringify({ scope: 'Isolated live DOM with production CSS and exact viewport controller; not native TauriTavern or a whole-card build.', passed: results.length, results, errors }, null, 2));
  console.log(`${results.length} layout scenarios passed; screenshots and results in ${output}`);
} finally { await browser.close(); }
