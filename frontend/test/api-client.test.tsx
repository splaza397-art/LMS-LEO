// Cliente HTTP y hooks de datos (Fase 3, etapa 3.3): errores, sesión vencida, sin reintentos, respuestas viejas.
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useApiData } from "@/hooks/use-api-data";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { ApiError, bff, errorFromResponse, kindOf, postPublic, query, setSessionExpiredHandler, uploadImage } from "@/lib/api/client";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("clasificación de errores", () => {
  it("cada código HTTP tiene un tipo", () => {
    expect([400, 401, 403, 404, 409, 429, 500, 502, 503].map(kindOf))
      .toEqual(["validation", "session", "forbidden", "not_found", "validation", "rate_limit", "server", "unavailable", "unavailable"]);
  });
  it("usa el mensaje del backend cuando ayuda y uno claro cuando no", () => {
    expect(errorFromResponse(400, { message: ["pageSize debe ser un entero", "q es muy largo"] }).message).toBe("pageSize debe ser un entero. q es muy largo");
    expect(errorFromResponse(403, { message: "El programa está fuera de tu ámbito" }).message).toBe("El programa está fuera de tu ámbito");
    expect(errorFromResponse(502, { message: "El campus no está disponible" }).message).toBe("El campus no está disponible");
    expect(errorFromResponse(429, { message: "ThrottlerException: Too Many Requests" }).message).toMatch(/Demasiados intentos/);
    expect(errorFromResponse(500, { message: "Internal server error" }).message).toMatch(/error en el servidor/);
    expect(errorFromResponse(401, { message: "Sesión requerida" }).message).toMatch(/sesión terminó/);
  });
});

describe("bff()", () => {
  it("una sesión vencida (401) lleva a iniciar sesión", async () => {
    const expired = vi.fn();
    setSessionExpiredHandler(expired);
    vi.stubGlobal("fetch", vi.fn(async () => json({ message: "Sesión requerida" }, 401)));
    await expect(bff("me")).rejects.toMatchObject({ kind: "session" });
    expect(expired).toHaveBeenCalledTimes(1);
  });
  it("una escritura que falla no se reintenta", async () => {
    const fetchMock = vi.fn(async () => json({ message: "Internal server error" }, 500));
    vi.stubGlobal("fetch", fetchMock);
    await expect(bff("admin/notifications", "POST", { title: "x" })).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("sin conexión informa un error de red", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    await expect(bff("me")).rejects.toMatchObject({ kind: "network", status: 0 });
  });
  it("envía JSON al BFF con el método indicado", async () => {
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => { void url; void init; return json({ ok: true }); });
    vi.stubGlobal("fetch", fetchMock);
    await bff("admin/info-requests/1", "PATCH", { status: "atendida" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/bff/v1/admin/info-requests/1");
    expect(init.method).toBe("PATCH");
    expect(init.body).toBe(JSON.stringify({ status: "atendida" }));
  });
  it("postPublic traduce el límite de intentos", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ message: "ThrottlerException" }, 429)));
    await expect(postPublic("/api/registro", {})).rejects.toMatchObject({ kind: "rate_limit", message: expect.stringMatching(/Demasiados intentos/) });
  });
});

describe("utilidades", () => {
  it("query() omite los valores vacíos y codifica", () => {
    expect(query({ page: 2, q: "ana lópez", status: "", role: undefined })).toBe("?page=2&q=ana+l%C3%B3pez");
    expect(query({})).toBe("");
  });
  it("uploadImage rechaza antes de enviar tipos o tamaños no permitidos", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(uploadImage(new File(["x"], "a.svg", { type: "image/svg+xml" }))).rejects.toMatchObject({ kind: "validation" });
    await expect(uploadImage(new File([new Uint8Array(5 * 1024 * 1024 + 1)], "a.png", { type: "image/png" }))).rejects.toThrow(/5 MB/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("useApiData", () => {
  it("una respuesta vieja no sobrescribe a la más reciente", async () => {
    let resolveSlow!: (r: Response) => void;
    vi.stubGlobal("fetch", vi.fn((url: string) => url.endsWith("lenta")
      ? new Promise<Response>((r) => { resolveSlow = r; })
      : Promise.resolve(json({ valor: "reciente" }))));
    const { result, rerender } = renderHook(({ path }) => useApiData<{ valor: string }>(path), { initialProps: { path: "lenta" } });
    rerender({ path: "rapida" });
    await waitFor(() => expect(result.current.data?.valor).toBe("reciente"));
    await act(async () => { resolveSlow(json({ valor: "vieja" })); });
    expect(result.current.data?.valor).toBe("reciente");
    expect(result.current.loading).toBe(false);
  });
  it("muestra el mensaje de error y con path null no pide nada", async () => {
    const fetchMock = vi.fn(async () => json({ message: "El campus no está disponible" }, 502));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useApiData("admin/moodle/courses"));
    await waitFor(() => expect(result.current.error).toBe("El campus no está disponible"));
    renderHook(() => useApiData(null));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("useDebouncedValue", () => {
  it("solo entrega el valor cuando se deja de escribir", () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v, 300), { initialProps: { v: "a" } });
    rerender({ v: "an" });
    rerender({ v: "ana" });
    act(() => { vi.advanceTimersByTime(299); });
    expect(result.current).toBe("a");
    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current).toBe("ana");
  });
});
