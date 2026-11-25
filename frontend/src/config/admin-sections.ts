/**
 * Secciones del panel de gestión y el permiso RBAC (backend/src/modules/auth/permissions.ts) que exige cada una.
 * Se usa en el servidor (acceso a /admin) y en el cliente (pestañas). Ocultar una sección no protege nada por sí
 * solo: el backend valida el permiso en cada solicitud.
 */
export const ADMIN_SECTIONS = [
  { id: "solicitudes", label: "Solicitudes", permission: "applications:review" },
  { id: "usuarios", label: "Usuarios", permission: "users:read" },
  { id: "programas", label: "Programas", permission: "programs:manage" },
  { id: "contenidos", label: "Contenidos", permission: "content:manage" },
  { id: "informacion", label: "Información", permission: "info_requests:manage" },
  { id: "avisos", label: "Avisos", permission: "notifications:send" },
  { id: "reportes", label: "Reportes", permission: "reports:read" },
  { id: "auditoria", label: "Auditoría", permission: "audit:read" },
] as const;

export type AdminSectionId = (typeof ADMIN_SECTIONS)[number]["id"];

/** Basta uno de estos permisos para entrar al panel. */
export const ADMIN_PERMISSIONS: readonly string[] = ADMIN_SECTIONS.map((s) => s.permission);

export const sectionsFor = (permissions: readonly string[]) => ADMIN_SECTIONS.filter((s) => permissions.includes(s.permission));
