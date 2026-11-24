"use client";

import { useEffect, useState } from "react";

type EstadoAPI = {
  sistema: string;
  estado: string;
  version: string;
  servicios?: { database: boolean; identidad: boolean; lms: boolean };
};

export function SystemStatus() {
  const [api, setApi] = useState<EstadoAPI | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/estado")
      .then((res) => {
        if (!res.ok) throw new Error("API no disponible");
        return res.json();
      })
      .then(setApi)
      .catch(() => setError(true));
  }, []);

  return (
    <div className="card mt-5" role="status">
      {api ? (
        <>
          <p className={`font-semibold ${api.estado === "operativo" ? "text-green-700" : "text-amber-700"}`}>
            {api.estado === "operativo" ? "Todos los servicios operan correctamente" : "Algunos servicios no están disponibles"}
          </p>
          <p className="mt-2 text-sm muted">
            {api.sistema} v{api.version} · Base de datos {api.servicios?.database ? "activa" : "inactiva"} · Identidad{" "}
            {api.servicios?.identidad ? "activa" : "inactiva"} · Campus {api.servicios?.lms ? "activo" : "inactivo"}
          </p>
        </>
      ) : (
        <p className="text-amber-700">{error ? "No se pudo conectar con el backend." : "Comprobando conexión con el backend..."}</p>
      )}
    </div>
  );
}
