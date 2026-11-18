import {catalog, openingPages} from './catalog.mjs?v=3';
import {isHeading, paginate} from './pagination.mjs?v=1';

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
const edition = document.querySelector('#edition');
const previousPage = document.querySelector('#previous-page');
const nextPage = document.querySelector('#next-page');
const pageNumber = document.querySelector('#page-number');
const fullscreen = document.querySelector('#reader-fullscreen');
let bookPages = [];
let pageIndex = 0;
let complete = false;
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

function updatePageControls() {
  previousPage.disabled = pageIndex === 0;
  nextPage.disabled = pageIndex + 1 >= bookPages.length;
  pageNumber.textContent = 'Стр. ' + (pageIndex + 1) + (complete ? ' из ' + bookPages.length : '');
}

function showPage(index) {
  pageIndex = index;
  const blocks = bookPages[index].map((block, i) => isHeading(block)
    ? element('h3', block.slice(2), {id:'page-heading-' + i})
    : element('p', block));
  pages.replaceChildren(...blocks);
  updatePageControls();
}

function updateContents() {
  const options = [element('option', 'Оглавление', {value:''})];
  bookPages.forEach((page, index) => page.forEach((block, i) => {
    if (isHeading(block)) options.push(element('option', block.slice(2), {value:index + ':' + i}));
  }));
  contents.replaceChildren(...options);
  contents.hidden = options.length < 3;
}

function turnPage(step) {
  const index = pageIndex + step;
  if (index < 0 || index >= bookPages.length) return;
  showPage(index);
  pages.scrollIntoView({block:'start'});
}

previousPage.onclick = () => turnPage(-1);
nextPage.onclick = () => turnPage(1);
contents.addEventListener('change', () => {
  if (!contents.value) return;
  const [index, heading] = contents.value.split(':');
  showPage(Number(index));
  document.getElementById('page-heading-' + heading)?.scrollIntoView();
  contents.value = '';
});

fullscreen.hidden = !document.fullscreenEnabled;
fullscreen.onclick = () => {
  const change = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
  change.catch(() => {});
};
document.addEventListener('fullscreenchange', () => {
  fullscreen.textContent = document.fullscreenElement ? 'Свернуть' : 'На весь экран';
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
  edition.textContent = book.author + ' · ' + book.text.translator;
  origin.href = book.text.href;
  complete = false;
  bookPages = [openingPages[book.text.file]];
  showPage(0);
  contents.hidden = true;
  status.textContent = 'Загружаю остальные страницы…';
  download.hidden = true;
  window.scrollTo(0, 0);
  title.focus({preventScroll:true});

  try {
    const url = 'texts/' + book.text.file + '.ru.txt.gz?v=1';
    const response = await fetch(url, {signal:controller.signal, cache:'force-cache'});
    if (!response.ok || !response.body) throw new Error('Текст недоступен');
    const stream = response.body.pipeThrough(new DecompressionStream('gzip'));
    const text = await new Response(stream).text();
    if (controller.signal.aborted) return;
    const fullPages = paginate(text);
    if (!fullPages.length) throw new Error('Текст пуст');
    const previewMatches = fullPages[0].join('\n\n') === bookPages[0].join('\n\n');
    bookPages = fullPages;
    complete = true;
    if (previewMatches) updatePageControls();
    else showPage(0);
    updateContents();
    const copy = text.replace(/^# /gm, '');
    fileUrl = URL.createObjectURL(new Blob([book.title, '\n', edition.textContent, '\n', book.text.href, '\n\n', copy], {type:'text/plain;charset=utf-8'}));
    download.href = fileUrl;
    download.download = book.text.file + '.ru.txt';
    download.hidden = false;
    status.textContent = '';
  } catch {
    if (!controller.signal.aborted) status.textContent = 'Продолжение не загрузилось. Попробуйте открыть книгу ещё раз.';
  }
}

document.querySelector('#close-reader').onclick = () => {
  request?.abort();
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  if (fileUrl) URL.revokeObjectURL(fileUrl);
  fileUrl = null;
  download.removeAttribute('href');
  reader.hidden = true;
  pages.replaceChildren();
  bookPages = [];
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
