import { sectionsFor } from "@/config/admin-sections";
import type { Me } from "@/types/api";

/**
 * Qué ve cada persona en Mi IINICIA, calculado solo con los roles y permisos que devuelve el backend (/me).
 * La matriz RBAC vive en el backend; aquí no se otorga nada: solo se decide qué secciones mostrar.
 *
 * | Rol                      | Docencia               | Mis cursos | Solicitudes | Panel de gestión |
 * |--------------------------|------------------------|------------|-------------|------------------|
 * | Superadministrador       | —                      | Sí         | —           | 8 secciones      |
 * | Administrador técnico    | —                      | —          | —           | Usuarios, Auditoría |
 * | Administrador académico  | —                      | Sí         | —           | 7 secciones      |
 * | Coordinador              | Cursos que supervisas  | Sí         | —           | 5 secciones (su programa) |
 * | Profesor                 | Mis grupos             | —          | —           | —                |
 * | Estudiante               | —                      | Sí         | —           | —                |
 * | Aspirante                | —                      | —          | Sí          | —                |
 * | Soporte                  | —                      | —          | —           | Usuarios (lectura) |
 */
export interface DashboardSections {
  /** Grupos con estudiantes: el profesor ve los suyos y el coordinador los cursos que supervisa. */
  teaching: "groups" | "supervision" | null;
  /** Cursos propios con avance y acceso al campus. */
  courses: boolean;
  /** Botón general "Entrar al Campus". */
  campus: boolean;
  /** Solicitudes de admisión y programas disponibles. */
  applications: boolean;
  /** Secciones del panel de gestión disponibles (vacío = sin acceso). */
  management: { id: string; label: string }[];
  upcoming: boolean;
}

export function dashboardSectionsFor(me: Pick<Me, "roles" | "permissions">): DashboardSections {
  const canCampus = me.permissions.includes("campus:access");
  const teacher = me.roles.includes("profesor");
  return {
    teaching: teacher ? "groups" : me.roles.includes("coordinador") ? "supervision" : null,
    courses: canCampus && !teacher,
    campus: canCampus,
    applications: me.roles.includes("aspirante"),
    management: sectionsFor(me.permissions).map(({ id, label }) => ({ id, label })),
    upcoming: canCampus,
  };
}
