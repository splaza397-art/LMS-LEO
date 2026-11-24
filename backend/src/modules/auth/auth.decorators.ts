import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Permission } from './permissions';

/** Identidad autenticada que el guard deja en la solicitud. Los roles salen de PostgreSQL, no del token. */
export interface AuthUser {
  id: string;
  sub: string;
  email: string;
  status: string;
  roles: string[];
  programIds: string[];
}

// Claves de metadatos. El inventario de rutas (tools/route-inventory) las lee: no cambiarlas.
export const PUBLIC_KEY = 'iinicia:public';
export const PERMISSION_KEY = 'iinicia:permission';

/** Endpoint sin sesión. Todo lo demás exige un token válido. */
export const Public = () => SetMetadata(PUBLIC_KEY, true);
/** Permiso de la matriz RBAC que exige el endpoint. */
export const RequirePermission = (permission: Permission) => SetMetadata(PERMISSION_KEY, permission);
export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest().user,
);
