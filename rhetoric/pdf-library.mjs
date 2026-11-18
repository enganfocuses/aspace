let database;
function openLibrary() {
  return database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('aspace-reader-pdfs', 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('books', {keyPath:'id'});
      request.result.createObjectStore('files');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }).catch(error => {
    database = null;
    throw error;
  });
}

async function useLibrary(stores, mode, operation) {
  const db = await openLibrary();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(stores, mode);
    const result = operation(transaction);
    transaction.oncomplete = () => resolve(result.result);
    transaction.onabort = () => reject(transaction.error);
  });
}

export const listPdfs = () => useLibrary(['books'], 'readonly', tx => tx.objectStore('books').getAll());
export const readPdfFile = id => useLibrary(['files'], 'readonly', tx => tx.objectStore('files').get(id));

export async function addPdf(file) {
  if (!(await file.slice(0, 1024).text()).includes('%PDF-')) return null;
  const book = {id: 'pdf-' + crypto.randomUUID(), title:file.name.replace(/\.pdf$/i, ''), added:Date.now()};
  await useLibrary(['books', 'files'], 'readwrite', tx => {
    tx.objectStore('files').put(file, book.id);
    return tx.objectStore('books').add(book);
  });
  return book;
}

export const removePdf = id => useLibrary(['books','files'], 'readwrite', tx => {
  tx.objectStore('files').delete(id);
  return tx.objectStore('books').delete(id);
});
