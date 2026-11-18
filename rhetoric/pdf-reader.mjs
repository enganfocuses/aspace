let engine;
function loadEngine() {
  return engine ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = '../vendor/pdf.min.js';
    script.onload = () => {
      const pdf = globalThis.pdfjsLib;
      pdf.GlobalWorkerOptions.workerSrc = '../vendor/pdf.worker.min.js';
      resolve(pdf);
    };
    script.onerror = () => {
      script.remove();
      engine = null;
      reject(new Error('PDF.js is unavailable'));
    };
    document.head.append(script);
  });
}

export async function openPdf(file, signal) {
  const [pdf, data] = await Promise.all([loadEngine(), file.arrayBuffer()]);
  signal.throwIfAborted();
  const task = pdf.getDocument({data, isEvalSupported:false, disableFontFace:true, useSystemFonts:true});
  signal.addEventListener('abort', () => void task.destroy().catch(() => {}), {once:true});
  try {
    return await task.promise;
  } catch (error) {
    if (!signal.aborted) void task.destroy().catch(() => {});
    throw error;
  }
}

export async function renderPdfPage(document, pageNumber, container, mode, signal) {
  const page = await document.getPage(pageNumber);
  signal.throwIfAborted();
  if (mode === 'text') {
    const content = await page.getTextContent();
    signal.throwIfAborted();
    const paragraphs = [];
    let paragraph = '';
    let previousLine;
    for (const item of content.items) {
      if (!item.str) continue;
      const y = item.transform?.[5];
      const height = item.height || Math.abs(item.transform?.[3]) || 12;
      if (previousLine && Math.abs(y - previousLine.y) > 1.55 * Math.max(height, previousLine.height)) {
        if (paragraph.trim()) paragraphs.push(paragraph.trim());
        paragraph = '';
      }
      paragraph += item.str + ' ';
      if (Number.isFinite(y)) previousLine = {y, height};
    }
    if (paragraph.trim()) paragraphs.push(paragraph.trim());
    if (paragraphs.length) {
      const blocks = paragraphs.map(text => {
        const block = container.ownerDocument.createElement('p');
        block.textContent = text;
        return block;
      });
      container.replaceChildren(...blocks);
      return true;
    }
  }

  const original = page.getViewport({scale:1});
  const width = Math.max(320, Math.min(container.clientWidth || 740, 1100));
  const scale = Math.min(width * (devicePixelRatio || 1) / original.width, 2400 / Math.max(original.width, original.height));
  const viewport = page.getViewport({scale});
  const canvas = container.ownerDocument.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  canvas.setAttribute('role','img');
  canvas.setAttribute('aria-label','Страница PDF ' + pageNumber);
  const painting = page.render({canvasContext:canvas.getContext('2d'), viewport});
  const cancel = () => painting.cancel();
  signal.addEventListener('abort', cancel, {once:true});
  try {
    await painting.promise;
    signal.throwIfAborted();
    container.replaceChildren(canvas);
  } finally {
    signal.removeEventListener('abort', cancel);
  }
  return false;
}
