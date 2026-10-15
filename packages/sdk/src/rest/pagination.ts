/**
 * Iteração sobre listas paginadas por cursor.
 *
 * A API devolve `{ items, prevCursor, nextCursor, hasMore }`. Este helper
 * converte uma função de página em um `AsyncGenerator` de itens, para
 * processar o histórico sem carregar tudo em memória.
 */

import type { CursorPaginationParams } from "../types/common";
import type { Page } from "../types/common";

export type PageFetcher<T> = (params: CursorPaginationParams) => Promise<Page<T>>;

/**
 * Percorre as páginas de uma lista, emitindo os itens um a um.
 *
 * @param fetchPage função que busca uma página (`limit`, `before`, `after`).
 * @param firstParams parâmetros da primeira página.
 * @param direction percorre para trás (`before`, o padrão do histórico)
 *   ou para frente (`after`).
 */
export async function* paginate<T>(
  fetchPage: PageFetcher<T>,
  firstParams: CursorPaginationParams = {},
  direction: "before" | "after" = "before",
): AsyncGenerator<T, void, unknown> {
  let params: CursorPaginationParams = { ...firstParams };
  // Guarda contra loops de cursor defeituoso.
  const seenCursors = new Set<string>();

  for (;;) {
    const page = await fetchPage(params);
    for (const item of page.items) {
      yield item;
    }
    if (!page.hasMore) return;

    const nextCursor =
      direction === "before"
        ? page.prevCursor
        : page.nextCursor;
    if (!nextCursor || seenCursors.has(nextCursor)) return;
    seenCursors.add(nextCursor);

    params =
      direction === "before"
        ? { ...params, limit: params.limit, before: nextCursor, after: undefined }
        : { ...params, limit: params.limit, after: nextCursor, before: undefined };
  }
}

/** Coleta todos os itens de uma paginação em um array (use com critério). */
export async function collectPagination<T>(
  fetchPage: PageFetcher<T>,
  firstParams: CursorPaginationParams = {},
  direction: "before" | "after" = "before",
  maxItems = 10_000,
): Promise<T[]> {
  const items: T[] = [];
  for await (const item of paginate(fetchPage, firstParams, direction)) {
    items.push(item);
    if (items.length >= maxItems) break;
  }
  return items;
}
