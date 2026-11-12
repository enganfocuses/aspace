import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const page=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const source=page.slice(page.indexOf('const THEMES='),page.indexOf('\napplyTheme();',page.indexOf('const THEMES=')));
for(const [stored,expected] of [['beige','beige'],['lavender','lavender'],['dark','dark'],['light','beige'],['unknown','beige']]){
 test(`appearance ${stored} selects ${expected} and updates embedded content`,()=>{
  const select={},messages=[],document={documentElement:{dataset:{}},querySelectorAll:selector=>selector==='.theme-select'?[select]:[{contentWindow:{postMessage:message=>messages.push(message)}}]};
  const context=vm.createContext({ls:{g:()=>stored},document});vm.runInContext(source+';applyTheme()',context);
  assert.equal(document.documentElement.dataset.theme,expected);assert.equal(select.value,expected);assert.equal(messages[0].theme,expected);assert.equal(messages[0].type,'aspace-theme');
 });
}
