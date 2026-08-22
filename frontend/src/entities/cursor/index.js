export function getSafeNextCursor(lastPage, allPages) {
  if (!lastPage.hasNext || lastPage.nextCursor === null) {
    return undefined;
  }

  const previousPages = allPages.slice(0, -1);
  const repeatedCursor = previousPages.some((page) => page.nextCursor === lastPage.nextCursor);
  return repeatedCursor ? undefined : lastPage.nextCursor;
}

export function mergeCursorPages(pages, getId = (item) => item.id) {
  const items = [];
  const seenIds = new Set();
  const seenCursors = new Set();
  let nextCursor = null;
  let hasNext = false;

  for (const page of pages) {
    for (const item of page.items) {
      const id = getId(item);
      if (!seenIds.has(id)) {
        seenIds.add(id);
        items.push(item);
      }
    }

    const repeatedCursor = page.nextCursor !== null && seenCursors.has(page.nextCursor);
    if (repeatedCursor) {
      nextCursor = null;
      hasNext = false;
      break;
    }

    if (page.nextCursor !== null) {
      seenCursors.add(page.nextCursor);
    }
    nextCursor = page.nextCursor;
    hasNext = page.hasNext && page.nextCursor !== null;
  }

  return { items, nextCursor, hasNext };
}
