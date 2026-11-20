const originals = new Map([
  ['b0145720f9454a7826770c8a548c0f7a7be18ff7ffd4a9430b09d9fb5eaf705d', 'beck-basics'],
  ['38e440ee33c894c1f072266445f8c46e0f8e7ddde572fceb8a57b850aed5301b', 'beck-challenges'],
  ['8dfb301c42361ed7e8334aa1fcdf7143ec69d5d9dab9dc64ec9827d14a6be6a8', 'defenses'],
]);

let database;
function openLibrary() {
  return database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('aspace-psychology-books', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('originals');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }).catch(error => {
    database = null;
    throw error;
  });
}

async function useLibrary(mode, operation) {
  const db = await openLibrary();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('originals', mode);
    const request = operation(transaction.objectStore('originals'));
    transaction.oncomplete = () => resolve(request.result);
    transaction.onabort = () => reject(transaction.error);
  });
}

export const savedBooks = () => useLibrary('readonly', store => store.getAllKeys());
export const savedBook = id => useLibrary('readonly', store => store.get(id));

export async function identifyOriginal(file) {
  if (![5650270, 30147935, 220694].includes(file.size)) return null;
  const hash = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return originals.get(Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('')) ?? null;
}

export const saveOriginal = (id, file) => useLibrary('readwrite', store => store.put(file, id));

let engine;
function loadReader() {
  return engine ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = '../vendor/pdf.min.js';
    script.onload = () => resolve(globalThis.pdfjsLib);
    script.onerror = () => {
      script.remove();
      engine = null;
      reject(new Error('Не удалось загрузить PDF-читалку.'));
    };
    document.head.append(script);
  });
}

export async function displayPdf(file, holder, active, E, B, P) {
  let task;
  let observer;
  const stop = () => {
    observer?.disconnect();
    void task?.destroy().catch(() => {});
  };
  try {
    const pdfjs = await loadReader();
    const data = await file.arrayBuffer();
    if (!active()) return;
    pdfjs.GlobalWorkerOptions.workerSrc = '../vendor/pdf.worker.min.js';
    task = pdfjs.getDocument({data, isEvalSupported: false, disableFontFace: true});
    observer = new MutationObserver(() => { if (!active()) stop(); });
    observer.observe(holder.closest('main'), {childList: true, subtree: true});
    const pdf = await task.promise;
    if (!active()) return;
    const canvas = E('canvas', {style: 'display:block;max-width:100%;height:auto;margin:0 auto'});
    const status = P('', 'mut');
    status.setAttribute('role', 'status');
    let number = 1;
    const prev = B('← Назад', () => void render(number - 1));
    const next = B('Дальше →', () => void render(number + 1));
    const jump = E('input', {type: 'number', min: 1, max: pdf.numPages, step: 1, value: '1', style: 'width:6rem'});
    const navigate = B('Перейти', () => {
      if (jump.checkValidity() && jump.value) void render(jump.valueAsNumber);
      else jump.reportValidity();
    });
    jump.setAttribute('aria-label', 'Номер страницы');
    jump.onkeydown = event => { if (event.key === 'Enter') navigate.click(); };
    holder.append(E('div', {className: 'row'}, prev, status, next, jump, navigate), canvas);

    async function render(pageNumber) {
      prev.disabled = next.disabled = navigate.disabled = true;
      status.textContent = `Страница ${pageNumber} из ${pdf.numPages}`;
      try {
        const page = await pdf.getPage(pageNumber);
        const pageWidth = page.getViewport({scale: 1}).width;
        const width = Math.min(holder.clientWidth || 800, 1200) * Math.min(devicePixelRatio || 1, 2);
        const viewport = page.getViewport({scale: width / pageWidth});
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        await page.render({canvasContext: canvas.getContext('2d'), viewport}).promise;
        page.cleanup();
        number = pageNumber;
        jump.value = String(number);
      } catch {
        status.textContent = 'Не удалось показать страницу PDF.';
      } finally {
        prev.disabled = number <= 1;
        next.disabled = number >= pdf.numPages;
        navigate.disabled = false;
      }
    }

    await render(1);
  } catch {
    stop();
    if (active()) holder.append(P('Не удалось открыть PDF в читалке. Попробуй открыть оригинал в отдельной вкладке.', 'error'));
  }
}
