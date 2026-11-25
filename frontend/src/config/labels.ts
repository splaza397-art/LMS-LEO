/** Etiquetas en español de los valores que devuelve la API. Una sola fuente para servidor y cliente. */
export const LEVEL_LABELS: Record<string, string> = {
  licenciatura: "Licenciatura", diplomado: "Diplomado", certificacion: "Certificación", curso: "Curso",
};

export const ROLE_LABELS: Record<string, string> = {
  superadmin: "Superadministrador", admin_tecnico: "Administrador técnico", admin_academico: "Administrador académico",
  coordinador: "Coordinador", profesor: "Profesor", estudiante: "Estudiante", aspirante: "Aspirante", soporte: "Soporte",
};

export const USER_STATUS_LABELS: Record<string, string> = { aspirante: "Aspirante", admitido: "Admitido", activo: "Activo", suspendido: "Suspendido" };
export const SYNC_LABELS: Record<string, string> = { none: "Sin cuenta", pending: "Pendiente", synced: "Sincronizado", error: "Error" };
export const APPLICATION_STATUS_LABELS: Record<string, string> = { enviada: "En revisión", admitida: "Admitida", rechazada: "No aprobada" };
export const INFO_STATUS_LABELS: Record<string, string> = { nueva: "Nueva", atendida: "Atendida" };
export const CONTENT_TYPE_LABELS: Record<string, string> = {
  noticia: "Noticia", pagina: "Página", faq: "Pregunta frecuente", docente: "Docente", autoridad: "Autoridad", contacto: "Contacto",
};
export const CONTENT_STATUS_LABELS: Record<string, string> = { borrador: "Borrador", publicado: "Publicado" };

/** Pares [valor, etiqueta] para listas desplegables, en el orden en que se declaran. */
export const options = (labels: Record<string, string>): [string, string][] => Object.entries(labels);
export const label = (labels: Record<string, string>, value: string | null | undefined) => (value ? labels[value] ?? value : "");
