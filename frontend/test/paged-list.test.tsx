// Paginación, búsqueda y filtros en el cliente (Fase 3, etapa 3.6).
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

let urlParams = new URLSearchParams();
vi.mock("next/navigation", () => ({ useSearchParams: () => urlParams }));
const { usePagedList } = await import("@/hooks/use-paged-list");

const requests: string[] = [];
const page = (items: unknown[], total: number) => new Response(JSON.stringify({ items, total, page: 1, pageSize: 20 }), { status: 200 });

beforeEach(() => {
  requests.length = 0;
  urlParams = new URLSearchParams();
  window.history.replaceState(null, "", "/admin");
  vi.stubGlobal("fetch", vi.fn(async (url: string) => { requests.push(decodeURIComponent(url)); return page([{ id: 1 }], 250); }));
});

describe("usePagedList", () => {
  it("siempre pide una página al backend (nunca la lista completa)", async () => {
    const { result } = renderHook(() => usePagedList("admin/users", { filters: { status: "" } }));
    await waitFor(() => expect(result.current.total).toBe(250));
    expect(requests).toEqual(["/api/bff/v1/admin/users?page=1&pageSize=20"]);
  });

  it("la búsqueda espera a que se deje de escribir y vuelve a la página 1", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { result } = renderHook(() => usePagedList("admin/users"));
    await waitFor(() => expect(requests.length).toBe(1));
    act(() => result.current.setPage(3));
    await waitFor(() => expect(requests.at(-1)).toContain("page=3"));
    for (const text of ["a", "an", "ana"]) act(() => result.current.setSearch(text));
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    await waitFor(() => expect(requests.at(-1)).toBe("/api/bff/v1/admin/users?q=ana&page=1&pageSize=20"));
    expect(requests.filter((r) => r.includes("q="))).toHaveLength(1);
    expect(result.current.page).toBe(1);
  });

  it("cambiar un filtro, el orden o el tamaño de página vuelve a la página 1", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { result } = renderHook(() => usePagedList("admin/audit", { filters: { action: "" } }));
    await waitFor(() => expect(requests.length).toBe(1));
    act(() => result.current.setPage(2));
    act(() => result.current.setFilter("action", "user.register"));
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    await waitFor(() => expect(requests.at(-1)).toBe("/api/bff/v1/admin/audit?action=user.register&page=1&pageSize=20"));
    act(() => result.current.setPage(2));
    act(() => result.current.setSort("action", "asc"));
    await waitFor(() => expect(requests.at(-1)).toBe("/api/bff/v1/admin/audit?action=user.register&sort=action&order=asc&page=1&pageSize=20"));
    act(() => result.current.setPageSize(100));
    await waitFor(() => expect(requests.at(-1)).toContain("page=1&pageSize=100"));
  });

  it("recupera filtros de la URL y los refleja al cambiar", async () => {
    urlParams = new URLSearchParams("seccion=usuarios&q=ana&status=activo&page=2");
    window.history.replaceState(null, "", `/admin?${urlParams}`);
    const { result } = renderHook(() => usePagedList("admin/users", { filters: { status: "", role: "" } }));
    await waitFor(() => expect(requests[0]).toBe("/api/bff/v1/admin/users?status=activo&q=ana&page=2&pageSize=20"));
    expect(result.current.search).toBe("ana");
    await waitFor(() => expect(window.location.search).toBe("?seccion=usuarios&status=activo&q=ana&page=2"));
  });

  it("con restoreFromUrl=false ignora la URL (pestaña abierta después)", async () => {
    urlParams = new URLSearchParams("status=enviada&q=x");
    renderHook(() => usePagedList("admin/users", { filters: { status: "" }, restoreFromUrl: false }));
    await waitFor(() => expect(requests[0]).toBe("/api/bff/v1/admin/users?page=1&pageSize=20"));
  });

  it("un error del backend se muestra sin perder la página", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ message: "pageSize no puede ser mayor que 100" }), { status: 400 })));
    const { result } = renderHook(() => usePagedList("admin/users"));
    await waitFor(() => expect(result.current.error).toBe("pageSize no puede ser mayor que 100"));
    expect(result.current.items).toBeNull();
  });
});
