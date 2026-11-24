// Matriz RBAC central (seccion 11 del documento de alcance). Es la unica fuente de permisos.
export const ROLES = [
  'superadmin', 'admin_tecnico', 'admin_academico', 'coordinador',
  'profesor', 'estudiante', 'aspirante', 'soporte',
] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = {
  'config:manage': ['superadmin'],
  'audit:read': ['superadmin', 'admin_tecnico'],
  'integrations:manage': ['superadmin', 'admin_tecnico'],
  'users:read': ['superadmin', 'admin_tecnico', 'admin_academico', 'coordinador', 'soporte'],
  'reports:read': ['superadmin', 'admin_academico', 'coordinador'],
  'info_requests:manage': ['superadmin', 'admin_academico'],
  'users:manage': ['superadmin', 'admin_academico'],
  'users:suspend': ['superadmin', 'admin_academico'],
  'roles:manage': ['superadmin'],
  'programs:manage': ['superadmin', 'admin_academico', 'coordinador'],
  'applications:review': ['superadmin', 'admin_academico', 'coordinador'],
  'enrolments:manage': ['superadmin', 'admin_academico', 'coordinador'],
  'content:manage': ['superadmin', 'admin_academico'],
  'notifications:send': ['superadmin', 'admin_academico', 'coordinador'],
  'teaching:read': ['profesor'],
  'campus:access': ['superadmin', 'admin_academico', 'coordinador', 'profesor', 'estudiante'],
  'application:create': ['aspirante'],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

/** Permisos cuyo alcance se limita al programa asignado cuando el usuario es coordinador. */
export const PROGRAM_SCOPED: ReadonlySet<Permission> = new Set<Permission>([
  'users:read', 'reports:read', 'programs:manage', 'applications:review', 'enrolments:manage', 'notifications:send',
]);

/** Roles con acceso administrativo amplio: exigen verificacion en dos pasos (seccion 16). */
export const PRIVILEGED_ROLES: readonly Role[] = ['superadmin', 'admin_tecnico', 'admin_academico'];

export function requiresMfa(roles: readonly string[]): boolean {
  return roles.some((role) => (PRIVILEGED_ROLES as readonly string[]).includes(role));
}

export function hasPermission(roles: readonly string[], permission: Permission): boolean {
  const allowed: readonly string[] = PERMISSIONS[permission];
  return roles.some((role) => allowed.includes(role));
}

export function permissionsFor(roles: readonly string[]): Permission[] {
  return (Object.keys(PERMISSIONS) as Permission[]).filter((p) => hasPermission(roles, p));
}

/** Verdadero si el acceso debe filtrarse por programa: solo coordinador, sin un rol global que lo cubra. */
export function isProgramScoped(roles: readonly string[], permission: Permission): boolean {
  if (!PROGRAM_SCOPED.has(permission)) return false;
  const allowed: readonly string[] = PERMISSIONS[permission];
  const effective = roles.filter((r) => allowed.includes(r));
  return effective.length > 0 && effective.every((r) => r === 'coordinador');
}
