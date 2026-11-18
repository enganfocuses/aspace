import {catalog} from './catalog.mjs';

function element(tag, text, props = {}) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  Object.assign(node, props);
  return node;
}
const library = document.querySelector('#collection');
const search = document.querySelector('.search input');
const shelves = document.querySelector('.shelves');
const reader = document.querySelector('#reader');
const pages = document.querySelector('#pages');
const status = document.querySelector('#reader-status');
const origin = document.querySelector('#origin');
const download = document.querySelector('#download');
let currentShelf = catalog[0].id, fileUrl, request;
const tabs = catalog.map(({id, title}) => {
  const button = element('button', title, {type:'button', onclick:() => {
    currentShelf = id;
    search.value = '';
    render();
  }});
  shelves.append(button);
  return [id, button];
});

async function readBook(book) {
  request?.abort();
  const controller = new AbortController();
  request = controller;
  document.querySelector('#reader-title').textContent = book.title;
  document.querySelector('#edition').textContent = book.author + ' · английский перевод, ' + book.text.translator;
  origin.href = book.text.href;
  pages.textContent = '';
  status.textContent = 'Загружаю текст…';
  download.hidden = true;
  reader.showModal();
  try {
    const response = await fetch('texts/' + book.text.file + '.txt.gz', {signal:controller.signal});
    if (!response.ok || !response.body) throw new Error('Текст недоступен');
    const stream = response.body.pipeThrough(new DecompressionStream('gzip'));
    const plainText = await new Response(stream).text();
    if (controller.signal.aborted) return;
    pages.textContent = plainText;
    fileUrl = URL.createObjectURL(new Blob([plainText], {type:'text/plain;charset=utf-8'}));
    download.href = fileUrl;
    download.download = book.text.file + '.txt';
    download.hidden = false;
    status.textContent = '';
  } catch {
    if (!controller.signal.aborted) status.textContent = 'Не удалось загрузить копию. Текст доступен по ссылке «Источник текста».';
  }
}

document.querySelector('#close-reader').onclick = () => reader.close();
reader.addEventListener('close', () => {
  request?.abort();
  if (fileUrl) URL.revokeObjectURL(fileUrl);
  fileUrl = null;
  download.removeAttribute('href');
});

function bookCard(book) {
  const card = element('article', '', {className:'book-card'});
  const links = element('div', '', {className:'links'});
  if (book.text) links.append(element('button', 'Читать в Aspace · EN', {className:'read-button primary', type:'button', onclick:() => void readBook(book)}));
  for (const {label, href} of book.sources) {
    links.append(element('a', label + ' ↗', {href, target:'_blank', rel:'noopener noreferrer'}));
  }
  card.append(element('h3', book.title), element('p', book.author, {className:'byline'}), element('p', book.subject), links);
  return card;
}
const normalize = value => value.toLocaleLowerCase('ru').replaceAll('ё', 'е');
function render() {
  const query = normalize(search.value.trim());
  for (const [id, button] of tabs) button.setAttribute('aria-pressed', String(!query && id === currentShelf));
  library.replaceChildren();
  for (const shelf of catalog) {
    if (!query && shelf.id !== currentShelf) continue;
    const books = shelf.books.filter(book => normalize([book.title, book.author, book.subject, ...book.sources.map(link => link.label)].join(' ')).includes(query));
    if (!books.length) continue;
    const group = element('section');
    const grid = element('div', '', {className:'books'});
    grid.append(...books.map(bookCard));
    group.append(element('h2', shelf.title, {className:'shelf-title'}), grid);
    library.append(group);
  }
  if (!library.children.length) library.append(element('p', 'По этому запросу книг нет.'));
}
search.addEventListener('input', render);
render();
