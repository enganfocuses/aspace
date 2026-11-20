import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const page=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const source=page.slice(page.indexOf('const THEMES='),page.indexOf('\napplyTheme();',page.indexOf('const THEMES=')));
for(const [stored,expected] of [['beige','beige'],['white','white'],['dark','dark'],['light','beige'],['unknown','beige']]){
 test(`appearance ${stored} selects ${expected} and updates embedded content`,()=>{
  const select={},messages=[],location=new URL('https://example.test/aspace/'),document={documentElement:{dataset:{}},querySelectorAll:selector=>selector==='.theme-select'?[select]:[{src:location.href,contentWindow:{postMessage:message=>messages.push(message)}}]};
  const context=vm.createContext({ls:{g:()=>stored},document,location,URL});vm.runInContext(source+';applyTheme()',context);
  assert.equal(document.documentElement.dataset.theme,expected);assert.equal(select.value,expected);assert.equal(messages[0].theme,expected);assert.equal(messages[0].type,'aspace-theme');
 });
}

test('shared guests always see beige, and owners cannot use wine on a board',()=>{
  const location=new URL('https://example.test/aspace/#s-'+'a'.repeat(48));
  const document={documentElement:{dataset:{}},querySelectorAll:()=>[]};
  const context=vm.createContext({ls:{g:()=> 'dark'},document,location,URL});
  vm.runInContext(source+';applyTheme()',context);
  assert.equal(document.documentElement.dataset.theme,'beige');
  location.hash='#b-test-edit';
  vm.runInContext("boardThemeScope='owner';applyTheme()",context);
  assert.equal(document.documentElement.dataset.theme,'beige');
  location.hash='#boards';
  vm.runInContext('boardThemeScope=null;applyTheme()',context);
  assert.equal(document.documentElement.dataset.theme,'dark');
});
