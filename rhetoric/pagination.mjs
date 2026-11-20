const PAGE_LENGTH = 1850;
export const isHeading = block => block.startsWith('# ');

function splitParagraph(block) {
  const parts = [];
  while (block.length > PAGE_LENGTH) {
    const boundary = block.slice(0, PAGE_LENGTH + 1).search(/[.!?…](?:[»”])?(?=\s)[\s\S]{0,240}$/);
    const sentenceEnd = boundary < 0 ? 0 : boundary + (/[»”]/.test(block[boundary + 1]) ? 2 : 1);
    const space = block.slice(0, PAGE_LENGTH + 1).search(/\s\S*$/);
    const end = sentenceEnd || (space > 0 ? space : PAGE_LENGTH);
    parts.push(block.slice(0, end).trimEnd());
    block = block.slice(end).trimStart();
  }
  if (block) parts.push(block);
  return parts;
}

export function paginate(text) {
  const pages = [];
  let page = [];
  let length = 0;
  function finishPage() {
    pages.push(page);
    page = [];
    length = 0;
  }

  for (const block of text.trim().split(/\n\s*\n/).filter(Boolean)) {
    for (const part of isHeading(block) ? [block] : splitParagraph(block)) {
      // Keep a heading on the same page as the text that follows it.
      if (length + part.length > PAGE_LENGTH && page.length && !isHeading(page.at(-1))) {
        finishPage();
      }
      page.push(part);
      length += part.length + 2;
    }
  }
  if (page.length) finishPage();
  return pages;
}
