/* Bootstrap wiring regression; model, phone and Vue mount are controlled stubs. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../src/frontend/main.ts'), 'utf8');
const code = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText.replace(/^import .*;$/mg,'').replace(/export \{\};?/g,'');
function run(failBinding) {
  let mounts=0, unmounts=0, releases=0, bindings=0;
  const bridge = {dispose(){}};
  const doc={body:{append(){}},documentElement:{hasAttribute(){return false}},createElement(){return {setAttribute(){},style:{},remove(){}};}};
  const win={document:doc,addEventListener(){},removeEventListener(){},setTimeout(){return 1},clearTimeout(){},parent:null};win.parent=win;
  const context={window:win,console,viewportCss:'/* test style */',createTavernBridge:()=>bridge,createPhoneRuntime:()=>({dispose:async()=>{}}),
    bindShellViewport(){bindings++; if(failBinding)throw Error('controlled binding failure');return {dispose(){releases++}}},
    mountShell(_host,_owner,_bridge,onExit){mounts++;let dead=false;return {dispose(){if(dead)return;dead=true;unmounts++;onExit('restored')}};}
  };
  vm.runInNewContext(code,context);
  assert.equal(bindings,1);assert.equal(mounts,1);
  if(failBinding){assert.equal(unmounts,1);assert.equal(releases,0);}
  else {win.__unreadCityShell.dispose();assert.equal(unmounts,1);assert.equal(releases,1);assert.equal(win.__unreadCityShell,undefined);}
}
run(false);run(true);
console.log('2 bootstrap wiring cases passed (controlled stubs).');
