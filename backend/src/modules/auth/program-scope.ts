import { ForbiddenException } from '@nestjs/common';
import type { AuthUser } from './auth.decorators';
import { isProgramScoped, type Permission } from './permissions';

/**
 * Ámbito del coordinador: si su permiso está limitado a programas, solo puede actuar sobre los suyos.
 * Los roles globales (superadministrador, administrador académico) no tienen esta restricción.
 */
export function assertProgramScope(actor: AuthUser, permission: Permission, programId: string): void {
  if (isProgramScoped(actor.roles, permission) && !actor.programIds.includes(programId)) {
    throw new ForbiddenException('El programa está fuera de tu ámbito');
  }
}
