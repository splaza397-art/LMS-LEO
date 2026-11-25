"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { PAGE_SIZES } from "@/components/tables/pagination";
import { query } from "@/lib/api/client";
import type { Page } from "@/types/api";
import { useApiData } from "./use-api-data";
import { useDebouncedValue } from "./use-debounced-value";

export interface PagedListOptions {
  /** Filtros de la lista y su valor inicial ("" = sin filtro). */
  filters?: Record<string, string>;
  sort?: string;
  order?: "asc" | "desc";
  pageSize?: number;
  /** false = no leer el estado inicial de la URL (por ejemplo, al llegar desde otra pestaña). */
  restoreFromUrl?: boolean;
}

interface State { q: string; filters: Record<string, string>; sort: string; order: string; pageSize: number }

const QUERY_KEYS = ["q", "page", "pageSize", "sort", "order"];

/**
 * Lista administrativa paginada en el backend (contrato de la Fase 2: page, pageSize, sort, order y filtros).
 * - La búsqueda espera a que se deje de escribir (debounce) y la solicitud anterior se cancela.
 * - Cualquier cambio de búsqueda, filtro, orden o tamaño vuelve a la página 1.
 * - El estado se refleja en la URL con history.replaceState (se puede compartir o recargar) sin volver a
 *   ejecutar la página en el servidor.
 */
export function usePagedList<T>(endpoint: string | null, options: PagedListOptions = {}) {
  const params = useSearchParams();
  const [initial] = useState(() => {
    const read = (key: string, fallback: string) => (options.restoreFromUrl === false ? fallback : params.get(key) ?? fallback);
    const filters = Object.fromEntries(Object.entries(options.filters ?? {}).map(([k, v]) => [k, read(k, v)]));
    const size = Number(read("pageSize", String(options.pageSize ?? PAGE_SIZES[0])));
    return {
      state: { q: read("q", ""), filters, sort: read("sort", options.sort ?? ""), order: read("order", options.order ?? ""), pageSize: PAGE_SIZES.includes(size) ? size : PAGE_SIZES[0] } as State,
      page: Math.max(1, Number(read("page", "1")) || 1),
    };
  });
  const [state, setState] = useState<State>(initial.state);
  // Búsqueda y filtros se consultan cuando se dejan de cambiar (texto serializado: un objeto nuevo en cada
  // render reiniciaría la espera indefinidamente).
  const settled = useDebouncedValue(JSON.stringify({ q: state.q, filters: state.filters }));
  const { q, filters } = JSON.parse(settled) as { q: string; filters: Record<string, string> };

  // La página guardada solo vale para la combinación de búsqueda y filtros con la que se eligió.
  const key = JSON.stringify([settled, state.sort, state.order, state.pageSize]);
  const [paging, setPaging] = useState({ key, page: initial.page });
  const page = paging.key === key ? paging.page : 1;

  const request = { ...filters, q, sort: state.sort, order: state.order, page, pageSize: state.pageSize };
  const path = endpoint === null ? null : `${endpoint}${query(request)}`;
  const result = useApiData<Page<T>>(path);

  const urlQuery = query({ ...state.filters, q: state.q, sort: state.sort, order: state.order, page: page > 1 ? page : undefined, pageSize: state.pageSize !== PAGE_SIZES[0] ? state.pageSize : undefined });
  useEffect(() => {
    if (endpoint === null) return;
    const url = new URL(window.location.href);
    for (const k of [...QUERY_KEYS, ...Object.keys(options.filters ?? {})]) url.searchParams.delete(k);
    for (const [k, v] of new URLSearchParams(urlQuery)) url.searchParams.set(k, v);
    if (url.href !== window.location.href) window.history.replaceState(window.history.state, "", url);
    // options.filters es estable por lista; se usa solo para saber qué claves limpiar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlQuery, endpoint]);

  const setPage = (next: number) => setPaging({ key, page: next });
  return {
    items: result.data?.items ?? null,
    total: result.data?.total ?? 0,
    page,
    pageSize: state.pageSize,
    search: state.q,
    filters: state.filters,
    sort: state.sort,
    order: state.order,
    loading: result.loading,
    error: result.error,
    setError: result.setError,
    reload: result.reload,
    setSearch: (value: string) => setState((s) => ({ ...s, q: value })),
    setFilter: (name: string, value: string) => setState((s) => ({ ...s, filters: { ...s.filters, [name]: value } })),
    setSort: (sort: string, order: string) => setState((s) => ({ ...s, sort, order })),
    setPage,
    setPageSize: (pageSize: number) => setState((s) => ({ ...s, pageSize })),
  };
}
