import {catalog} from './catalog.mjs?v=2';

function element(tag, text, props = {}) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  Object.assign(node, props);
  return node;
}
const catalogView = document.querySelector('#catalog');
const library = document.querySelector('#collection');
const search = document.querySelector('.search input');
const shelves = document.querySelector('.shelves');
const reader = document.querySelector('#reader');
const pages = document.querySelector('#pages');
const status = document.querySelector('#reader-status');
const origin = document.querySelector('#origin');
const download = document.querySelector('#download');
const title = document.querySelector('#reader-title');
const contents = document.querySelector('#contents');
let currentShelf = catalog[0].id;
let request, activeButton, fileUrl;
let catalogScroll = 0;
const tabs = catalog.map(({id, title}) => {
  const button = element('button', title, {type:'button', onclick:() => {
    currentShelf = id;
    search.value = '';
    render();
  }});
  shelves.append(button);
  return [id, button];
});

function renderText(text) {
  const blocks = document.createDocumentFragment();
  const headings = [];
  for (const block of text.trim().split(/\n\s*\n/)) {
    if (block.startsWith('# ')) {
      const heading = element('h3', block.slice(2), {id: 'chapter-' + headings.length});
      headings.push(element('option', heading.textContent, {value: heading.id}));
      blocks.append(heading);
    } else {
      blocks.append(element('p', block));
    }
  }
  pages.replaceChildren(blocks);
  contents.replaceChildren(element('option', 'Оглавление', {value:''}), ...headings);
  contents.hidden = headings.length < 2;
}

contents.addEventListener('change', () => {
  document.getElementById(contents.value)?.scrollIntoView();
  contents.value = '';
});

async function readBook(book, button) {
  request?.abort();
  const controller = new AbortController();
  request = controller;
  activeButton = button;
  catalogScroll = window.scrollY;
  catalogView.hidden = true;
  reader.hidden = false;
  title.textContent = book.title;
  document.querySelector('#edition').textContent = book.author + ' · ' + book.text.translator;
  origin.href = book.text.href;
  pages.replaceChildren();
  contents.hidden = true;
  status.textContent = 'Загружаю текст…';
  download.hidden = true;
  window.scrollTo(0, 0);
  title.focus({preventScroll:true});

  try {
    const url = 'texts/' + book.text.file + '.ru.txt.gz';
    const response = await fetch(url, {signal:controller.signal});
    if (!response.ok || !response.body) throw new Error('Текст недоступен');
    const stream = response.body.pipeThrough(new DecompressionStream('gzip'));
    const text = await new Response(stream).text();
    if (controller.signal.aborted) return;
    renderText(text);
    const copy = text.replace(/^# /gm, '');
    fileUrl = URL.createObjectURL(new Blob([book.title, '\n', document.querySelector('#edition').textContent, '\n', book.text.href, '\n\n', copy], {type:'text/plain;charset=utf-8'}));
    download.href = fileUrl;
    download.download = book.text.file + '.ru.txt';
    download.hidden = false;
    status.textContent = '';
  } catch {
    if (!controller.signal.aborted) status.textContent = 'Не удалось загрузить текст. Попробуйте открыть книгу ещё раз или перейдите к источнику перевода.';
  }
}

document.querySelector('#close-reader').onclick = () => {
  request?.abort();
  if (fileUrl) URL.revokeObjectURL(fileUrl);
  fileUrl = null;
  download.removeAttribute('href');
  reader.hidden = true;
  pages.replaceChildren();
  catalogView.hidden = false;
  window.scrollTo(0, catalogScroll);
  activeButton?.focus({preventScroll:true});
};

function bookCard(book) {
  const card = element('article', '', {className:'book-card'});
  const links = element('div', '', {className:'links'});
  if (book.text) links.append(element('button', 'Читать в Aspace', {className:'read-button primary', type:'button', onclick:event => void readBook(book, event.currentTarget)}));
  if (!book.text) links.append(element('span', 'Сведения об издании', {className:'byline'}));
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
