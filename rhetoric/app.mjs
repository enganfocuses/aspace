import {catalog, openingPages} from './catalog.mjs?v=3';
import {isHeading, paginate} from './pagination.mjs?v=1';
import {addPdf, listPdfs, readPdfFile, removePdf} from './pdf-library.mjs?v=2';

const localShelf = {id:'personal-pdfs', title:'Мои PDF', books:[]};
const shelvesData = [...catalog, localShelf];

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
const spread = document.querySelector('#book-spread');
const rightSheet = spread.querySelector('.sheet-right');
const layout = document.querySelector('#reading-layout');
const sheets = [...spread.querySelectorAll('.book-sheet')].map(sheet => ({
  content:sheet.querySelector('.page-content'), folio:sheet.querySelector('.folio')
}));
const status = document.querySelector('#reader-status');
const origin = document.querySelector('#origin');
const download = document.querySelector('#download');
const title = document.querySelector('#reader-title');
const contents = document.querySelector('#contents');
const edition = document.querySelector('#edition');
const previousPage = document.querySelector('#previous-page');
const nextPage = document.querySelector('#next-page');
const pageNumber = document.querySelector('#page-number');
const pageTotal = document.querySelector('#page-total');
const pageAnnouncement = document.querySelector('#page-announcement');
const jumpButton = document.querySelector('#jump-page');
const fullscreen = document.querySelector('#reader-fullscreen');
const leftEdge = document.querySelector('#left-edge');
const rightEdge = document.querySelector('#right-edge');
const notes = document.querySelector('#book-notes');
const notesPanel = document.querySelector('#notes-panel');
const notesToggle = document.querySelector('#toggle-notes');
const notesStatus = document.querySelector('#notes-status');
const notesExport = document.querySelector('#export-notes');
const typography = document.querySelector('#typography');
const fontFamily = document.querySelector('#font-family');
const fontSize = document.querySelector('#font-size');
const textSize = document.querySelector('#text-size');
const lineHeight = document.querySelector('#line-height');
const pdfMode = document.querySelector('#pdf-mode');
const pdfZoom = document.querySelector('#pdf-zoom');
const narrowReader = matchMedia('(max-width: 880px)');
const wideSpread = matchMedia('(min-width: 780px)');
let activeBook, pdfDocument, painting;
let bookPages = [];
let pageIndex = 0;
let complete = false;
let currentShelf = catalog[0].id;
let request, activeButton, fileUrl;
let catalogScroll = 0;
const tabs = shelvesData.map(({id, title}) => {
  const button = element('button', title, {type:'button', onclick:() => {
    currentShelf = id;
    search.value = '';
    render();
  }});
  shelves.append(button);
  return [id, button];
});

const volatileSettings = new Map();
function readLocal(key) {
  if (volatileSettings.has(key)) return volatileSettings.get(key);
  try { return localStorage.getItem('aspace-reader:' + key); } catch { return null; }
}

function saveLocal(key, value) {
  try {
    localStorage.setItem('aspace-reader:' + key, value);
    volatileSettings.delete(key);
    return true;
  } catch {
    volatileSettings.set(key, value);
    return false;
  }
}

function titleKey(book) {
  return 'title:' + (book.pdfId ?? book.text?.file ?? JSON.stringify([book.author, book.title]));
}

function displayTitle(book) {
  return readLocal(titleKey(book)) || book.title;
}

const renameDialog = document.querySelector('#rename-book');
const renameInput = document.querySelector('#book-title-input');
const renameStatus = document.querySelector('#rename-status');
let renamingBook;

function renameBook(book) {
  renamingBook = book;
  renameStatus.textContent = '';
  renameInput.setCustomValidity('');
  renameInput.value = displayTitle(book);
  renameDialog.showModal();
  renameInput.focus();
  renameInput.select();
}

function saveBookTitle() {
  const name = renameInput.value.trim();
  renameInput.setCustomValidity(name ? '' : 'Введи название книги.');
  if (!renameInput.reportValidity()) return;
  const key = titleKey(renamingBook);
  const saved = saveLocal(key, name);
  if (saved) renameDialog.close();
  if (!reader.hidden) title.textContent = displayTitle(activeBook);
  render();
  const card = findBookCard(key);
  if (!reader.hidden) activeButton = card?.querySelector('.read-button');
  else if (saved) card?.querySelector('.rename-card-book')?.focus({preventScroll:true});
  if (!saved) renameStatus.textContent = 'Название обновлено до закрытия вкладки.';
}

function findBookCard(key) {
  return [...library.querySelectorAll('.book-card')].find(card => card.dataset.titleKey === key);
}

document.querySelector('#rename-reader-book').onclick = () => renameBook(activeBook);
document.querySelector('#save-rename').onclick = saveBookTitle;
document.querySelector('#cancel-rename').onclick = () => renameDialog.close();
renameInput.oninput = () => renameInput.setCustomValidity('');
renameInput.onkeydown = event => {
  if (event.key === 'Enter' && !event.isComposing) saveBookTitle();
};

layout.value = ['single','spread'].includes(readLocal('layout')) ? readLocal('layout') : 'auto';
function isSpread() {
  return layout.value === 'spread' || (layout.value === 'auto' && wideSpread.matches);
}

function spreadStart() {
  return isSpread() ? pageIndex - pageIndex % 2 : pageIndex;
}

function updateLayout() {
  const twoPages = isSpread();
  reader.classList.toggle('has-spread', twoPages);
  rightSheet.hidden = !twoPages;
  leftEdge.setAttribute('aria-label', twoPages ? 'Предыдущий разворот' : 'Предыдущая страница');
  rightEdge.setAttribute('aria-label', twoPages ? 'Следующий разворот' : 'Следующая страница');
  if (!reader.hidden && countPages()) showPage(pageIndex);
}
layout.onchange = () => {
  saveLocal('layout', layout.value);
  updateLayout();
};
wideSpread.addEventListener('change', () => {
  if (layout.value === 'auto') updateLayout();
});
updateLayout();

function readingKey(field) {
  return field + ':' + (activeBook.pdfId ?? activeBook.text.file);
}

const fontStacks = {
  georgia:'Georgia, serif',
  times:'"Times New Roman", serif',
  sans:'Arial, sans-serif',
  system:'system-ui, sans-serif'
};
fontFamily.value = Object.hasOwn(fontStacks, readLocal('font')) ? readLocal('font') : 'georgia';
fontSize.value = readLocal('size') ?? '19';
lineHeight.value = ['1.45','1.65','1.9'].includes(readLocal('spacing')) ? readLocal('spacing') : '1.65';
function applyTypography() {
  spread.style.setProperty('--book-font', fontStacks[fontFamily.value]);
  spread.style.setProperty('--book-size', fontSize.value + 'px');
  spread.style.setProperty('--book-spacing', lineHeight.value);
  textSize.textContent = fontSize.value + ' пкс';
}

for (const [control, key] of [[fontFamily,'font'], [fontSize,'size'], [lineHeight,'spacing']]) {
  control.addEventListener('input', () => {
    saveLocal(key, control.value);
    applyTypography();
  });
}
applyTypography();

function setNotesOpen(open) {
  notesPanel.hidden = !open;
  reader.classList.toggle('with-notes', open);
  notesToggle.setAttribute('aria-expanded', String(open));
}

notesToggle.onclick = () => {
  const open = notesPanel.hidden;
  setNotesOpen(open);
  if (open) notes.focus({preventScroll:!narrowReader.matches});
};
narrowReader.addEventListener('change', () => setNotesOpen(!narrowReader.matches));

function saveNotes() {
  notesExport.disabled = !notes.value.trim();
  const saved = saveLocal(readingKey('notes'), notes.value);
  notesStatus.textContent = saved ? 'Сохранено в этом браузере' : 'Хранилище недоступно. Скачай заметки, чтобы их сохранить.';
}
notes.addEventListener('input', saveNotes);
document.querySelector('#note-page').onclick = () => {
  const start = notes.selectionStart;
  const end = notes.selectionEnd;
  const label = 'Страница ' + (pageIndex + 1) + ' — ';
  const prefix = start && notes.value[start - 1] !== '\n' ? '\n' : '';
  notes.setRangeText(prefix + label, start, end, 'end');
  saveNotes();
  notes.focus();
};
notesExport.onclick = () => {
  const exportUrl = URL.createObjectURL(new Blob([displayTitle(activeBook), '\n\n', notes.value], {type:'text/plain;charset=utf-8'}));
  const filename = displayTitle(activeBook).replace(/[\\/:*?"<>|]/g,'-').trim().slice(0,100);
  const link = element('a', '', {href:exportUrl, download:filename + ' — заметки.txt'});
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(exportUrl), 1000);
};

function countPages() {
  return pdfDocument?.numPages ?? bookPages.length;
}

function visibleSheets() {
  const first = spreadStart();
  return sheets.slice(0, isSpread() ? 2 : 1).map((sheet, offset) => ({...sheet, index:first + offset}));
}

async function showPdfPages() {
  painting?.abort();
  const controller = new AbortController();
  painting = controller;
  const mode = pdfMode.value;
  const visible = visibleSheets().filter(({index}) => index < countPages());
  const document = pdfDocument;
  pdfZoom.hidden = true;
  status.textContent = 'Открываю PDF…';
  try {
    const {renderPdfPage} = await import('./pdf-reader.mjs?v=1');
    controller.signal.throwIfAborted();
    const results = await Promise.allSettled(visible.map(async ({content, index}) => {
      const asText = await renderPdfPage(document, index + 1, content, mode, controller.signal);
      content.classList.toggle('pdf-original', !asText);
      return asText;
    }));
    controller.signal.throwIfAborted();
    const failed = results.some(result => result.status === 'rejected');
    const hasOriginal = results.some(result => result.status === 'fulfilled' && !result.value);
    pdfZoom.hidden = !hasOriginal;
    status.textContent = failed ? 'Не удалось показать одну из страниц PDF.'
      : mode === 'text' && hasOriginal ? 'Страницы без текстового слоя показаны в оригинале.' : '';
  } catch {
    if (!controller.signal.aborted) status.textContent = 'Не удалось открыть страницы PDF.';
  }
}

pdfZoom.onchange = () => spread.style.setProperty('--pdf-zoom', pdfZoom.value + '%');

pdfMode.onchange = () => {
  typography.hidden = pdfMode.value === 'original';
  showPage(pageIndex);
};

function updatePageControls() {
  const first = spreadStart();
  const last = Math.min(first + (isSpread() ? 2 : 1), countPages());
  previousPage.disabled = leftEdge.disabled = first === 0;
  nextPage.disabled = rightEdge.disabled = last >= countPages();
  pageNumber.value = pageIndex + 1;
  pageNumber.max = countPages();
  pageNumber.disabled = jumpButton.disabled = !complete || countPages() < 2;
  pageTotal.textContent = complete ? 'из ' + countPages() : '';
  const range = last > first + 1 ? 'Страницы ' + (first + 1) + '–' + last : 'Страница ' + (first + 1);
  pageAnnouncement.textContent = range + ' ' + pageTotal.textContent;
}

function showPage(index) {
  pageIndex = index;
  for (const {content, folio} of sheets) {
    content.replaceChildren();
    content.classList.remove('pdf-original');
    content.removeAttribute('aria-label');
    folio.textContent = '';
  }
  for (const {content, folio, index} of visibleSheets()) {
    if (index >= countPages()) continue;
    folio.textContent = String(index + 1);
    content.setAttribute('aria-label','Страница ' + (index + 1));
    if (!pdfDocument) {
      content.replaceChildren(...bookPages[index].map((block, i) => isHeading(block)
        ? element('h3', block.slice(2), {id:'page-heading-' + index + '-' + i})
        : element('p', block)));
    }
  }
  if (pdfDocument) void showPdfPages();
  if (complete) saveLocal(readingKey('page'), String(pageIndex));
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

function goToPage(index) {
  if (!Number.isInteger(index) || index < 0 || index >= countPages() || index === pageIndex) return false;
  showPage(index);
  window.scrollTo(0, 0);
  return true;
}

function turn(direction) {
  return goToPage(spreadStart() + direction * (isSpread() ? 2 : 1));
}
previousPage.onclick = leftEdge.onclick = () => turn(-1);
nextPage.onclick = rightEdge.onclick = () => turn(1);
function jumpToPage() {
  if (!pageNumber.reportValidity()) return;
  goToPage(pageNumber.valueAsNumber - 1);
  sheets[pageIndex - spreadStart()].content.focus({preventScroll:true});
}

jumpButton.onclick = jumpToPage;
pageNumber.addEventListener('keydown', event => {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  jumpToPage();
});
document.addEventListener('keydown', event => {
  if (reader.hidden || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
  if (event.target.closest?.('input, textarea, select, [contenteditable]') || window.getSelection()?.isCollapsed === false) return;
  if (turn(event.key === 'ArrowRight' ? 1 : -1)) event.preventDefault();
});
contents.addEventListener('change', () => {
  if (!contents.value) return;
  const [index, heading] = contents.value.split(':');
  showPage(Number(index));
  document.getElementById('page-heading-' + index + '-' + heading)?.scrollIntoView();
  contents.value = '';
});

function setExpanded(expanded) {
  document.documentElement.classList.toggle('reader-expanded', expanded);
  fullscreen.textContent = expanded ? 'Свернуть' : 'На весь экран';
  if (window.parent !== window) {
    window.parent.postMessage({type:'aspace-rhetoric-expand', expanded}, location.origin);
  }
}

fullscreen.onclick = () => setExpanded(!document.documentElement.classList.contains('reader-expanded'));
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && document.documentElement.classList.contains('reader-expanded')) setExpanded(false);
});

function startReader(book, button) {
  request?.abort();
  painting?.abort();
  request = new AbortController();
  activeBook = book;
  activeButton = button;
  catalogScroll = window.scrollY;
  catalogView.hidden = true;
  reader.hidden = false;
  title.textContent = displayTitle(book);
  origin.hidden = !book.text;
  if (book.text) origin.href = book.text.href;
  edition.textContent = book.text ? book.author + ' · ' + book.text.translator : 'Личный PDF';
  contents.hidden = true;
  download.hidden = true;
  typography.open = false;
  typography.hidden = Boolean(book.pdfId);
  pdfMode.hidden = !book.pdfId;
  pdfMode.value = 'original';
  pdfZoom.hidden = true;
  pdfZoom.value = '100';
  pdfZoom.onchange();
  for (const {content, folio} of sheets) {
    content.classList.remove('pdf-original');
    content.replaceChildren();
    folio.textContent = '';
  }
  pdfDocument = null;
  bookPages = [];
  pageIndex = 0;
  complete = false;
  notes.value = readLocal(readingKey('notes')) ?? '';
  notesExport.disabled = !notes.value.trim();
  notesStatus.textContent = 'Заметки сохраняются в этом браузере.';
  setNotesOpen(!narrowReader.matches);
  updatePageControls();
  window.scrollTo(0, 0);
  title.focus({preventScroll:true});
  return request;
}

function savedPage() {
  const index = Number(readLocal(readingKey('page')));
  return Number.isInteger(index) ? Math.max(0, Math.min(index, countPages() - 1)) : 0;
}

async function readPdf(book, button) {
  const {signal} = startReader(book, button);
  status.textContent = 'Открываю PDF…';
  pdfMode.disabled = true;
  try {
    const [file, {openPdf}] = await Promise.all([readPdfFile(book.pdfId), import('./pdf-reader.mjs?v=1')]);
    signal.throwIfAborted();
    if (!file) throw new Error('Нет файла');
    const opened = await openPdf(file, signal);
    signal.throwIfAborted();
    pdfDocument = opened;
    complete = true;
    pdfMode.disabled = false;
    showPage(savedPage());
  } catch (error) {
    if (!signal.aborted) status.textContent = error.name === 'PasswordException'
      ? 'Этот PDF защищён паролем. Добавь копию без пароля.'
      : 'Не удалось открыть PDF. Проверь, открывается ли исходный файл.';
  }
}

async function readBook(book, button) {
  const controller = startReader(book, button);
  bookPages = [openingPages[book.text.file]];
  showPage(0);
  status.textContent = 'Загружаю остальные страницы…';
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
    const start = savedPage();
    if (previewMatches && start === 0 && !isSpread()) updatePageControls();
    else showPage(start);
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
  painting?.abort();
  pdfDocument = null;
  if (document.documentElement.classList.contains('reader-expanded')) setExpanded(false);
  if (fileUrl) URL.revokeObjectURL(fileUrl);
  fileUrl = null;
  download.removeAttribute('href');
  reader.hidden = true;
  for (const {content} of sheets) content.replaceChildren();
  bookPages = [];
  catalogView.hidden = false;
  window.scrollTo(0, catalogScroll);
  activeButton?.focus({preventScroll:true});
};

function bookCard(book) {
  const card = element('article', '', {className:'book-card'});
  card.dataset.titleKey = titleKey(book);
  const links = element('div', '', {className:'links'});
  const actions = element('div', '', {className:'book-actions'});
  links.append(actions);
  if (book.text) actions.append(element('button', 'Читать', {className:'read-button primary', type:'button', onclick:event => void readBook(book, event.currentTarget)}));
  if (book.pdfId) {
    actions.append(element('button', 'Читать PDF', {className:'read-button primary', type:'button', onclick:event => void readPdf(book, event.currentTarget)}));
    const removal = element('details', '', {className:'remove-pdf'});
    const confirm = element('button', 'Удалить файл', {type:'button', onclick:async () => {
      confirm.disabled = true;
      try {
        await removePdf(book.pdfId);
        for (const field of ['page','notes','title']) {
          const key = field + ':' + book.pdfId;
          volatileSettings.delete(key);
          try { localStorage.removeItem('aspace-reader:' + key); } catch {}
        }
        importStatus.textContent = 'PDF удалён из этого браузера.';
        await refreshPdfs();
      } catch {
        importStatus.textContent = 'Не удалось удалить PDF.';
        confirm.disabled = false;
      }
    }});
    removal.append(element('summary','Удалить PDF'), element('p','Файл и заметки к нему будут удалены из этого браузера.'), confirm);
    links.append(removal);
  }
  if (!book.text && !book.pdfId) links.append(element('span', 'Сведения об издании', {className:'byline'}));
  for (const {label, href} of book.sources) {
    links.append(element('a', label + ' ↗', {href, target:'_blank', rel:'noopener noreferrer'}));
  }
  actions.append(element('button', 'Переименовать', {className:'quiet-button rename-card-book', type:'button',
    onclick:() => renameBook(book)}));
  card.append(element('h3', displayTitle(book)), element('p', book.author, {className:'byline'}), element('p', book.subject), links);
  return card;
}
const normalize = value => value.toLocaleLowerCase('ru').replaceAll('ё', 'е');
function render() {
  const query = normalize(search.value.trim());
  for (const [id, button] of tabs) button.setAttribute('aria-pressed', String(!query && id === currentShelf));
  library.replaceChildren();
  for (const shelf of shelvesData) {
    if (!query && shelf.id !== currentShelf) continue;
    const books = shelf.books.filter(book => normalize([displayTitle(book), book.title, book.author, book.subject, ...book.sources.map(link => link.label)].join(' ')).includes(query));
    if (!books.length) continue;
    const group = element('section');
    const grid = element('div', '', {className:'books'});
    grid.append(...books.map(bookCard));
    group.append(element('h2', shelf.title, {className:'shelf-title'}), grid);
    library.append(group);
  }
  if (!library.children.length) library.append(element('p',
    !query && currentShelf === localShelf.id ? 'Здесь будут PDF, которые ты добавишь.' : 'По этому запросу книг нет.'));

}
search.addEventListener('input', render);
render();

const pdfFiles = document.querySelector('#pdf-files');
const importButton = document.querySelector('#import-pdf');
const importStatus = document.querySelector('#import-status');
importButton.onclick = () => pdfFiles.click();

async function refreshPdfs() {
  try {
    const books = await listPdfs();
    localShelf.books = books.sort((a,b) => b.added - a.added).map(book => ({
      pdfId:book.id, title:book.title, author:'Личный PDF',
      subject:'Хранится в этом браузере', sources:[]
    }));
    render();
  } catch {
    importStatus.textContent = 'Хранилище PDF в этом браузере недоступно.';
  }
}

pdfFiles.onchange = async () => {
  const files = Array.from(pdfFiles.files);
  pdfFiles.value = '';
  if (!files.length) return;
  importButton.disabled = true;
  importStatus.textContent = 'Сохраняю PDF…';
  let added = 0;
  const skipped = [];
  for (const file of files) {
    try {
      if (await addPdf(file)) added++;
      else skipped.push(file.name);
    } catch {
      skipped.push(file.name);
    }
  }
  if (added) {
    currentShelf = localShelf.id;
    search.value = '';
  }
  await refreshPdfs();
  importStatus.textContent = [added ? 'Добавлено PDF: ' + added + '.' : '',
    skipped.length ? 'Не удалось добавить: ' + skipped.join(', ') + '. Проверь файлы и свободное место.' : '']
    .filter(Boolean).join(' ');
  importButton.disabled = false;
};
void refreshPdfs();
