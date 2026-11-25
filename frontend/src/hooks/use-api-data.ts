"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, bff, isAbort } from "@/lib/api/client";

export interface ApiData<T> {
  /** Últimos datos recibidos. Mientras llegan los de una ruta nueva se conservan los anteriores. */
  data: T | null;
  error: string;
  loading: boolean;
  /** Vuelve a pedir los datos (por ejemplo, después de guardar). */
  reload: () => Promise<void>;
  setError: (message: string) => void;
}

interface Result<T> { path: string | null; data: T | null; error: string }

const messageOf = (e: unknown) => (e instanceof ApiError ? e.message : "No se pudo cargar la información.");

/**
 * Lectura desde el BFF. Cancela la solicitud anterior cuando cambia la ruta y descarta respuestas viejas,
 * para que una respuesta lenta nunca sobrescriba a una más reciente. Con path = null no pide nada.
 * El estado solo cambia cuando llega una respuesta; "cargando" se deduce de qué ruta ya se resolvió.
 */
export function useApiData<T>(path: string | null): ApiData<T> {
  const [result, setResult] = useState<Result<T>>({ path: null, data: null, error: "" });
  const [reloading, setReloading] = useState(false);
  const latest = useRef(0);
  const controller = useRef<AbortController | null>(null);

  const fetchInto = useCallback(async (target: string) => {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    const id = ++latest.current;
    try {
      const data = await bff<T>(target, "GET", undefined, current.signal);
      if (id === latest.current) setResult({ path: target, data, error: "" });
    } catch (e) {
      if (isAbort(e) || id !== latest.current) return;
      setResult((r) => ({ path: target, data: r.data, error: messageOf(e) }));
    }
  }, []);

  useEffect(() => {
    if (path === null) return;
    void fetchInto(path);
    return () => controller.current?.abort();
  }, [path, fetchInto]);

  const reload = useCallback(async () => {
    if (path === null) return;
    setReloading(true);
    try {
      await fetchInto(path);
    } finally {
      setReloading(false);
    }
  }, [path, fetchInto]);

  const setError = useCallback((error: string) => setResult((r) => ({ ...r, error })), []);
  const loading = path !== null && (result.path !== path || reloading);
  return { data: result.data, error: result.error, loading, reload, setError };
}
