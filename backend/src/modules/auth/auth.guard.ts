import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { config } from '../../config';
import { DbService } from '../../db/db.service';
import { AuthUser, PERMISSION_KEY, PUBLIC_KEY } from './auth.decorators';
import { hasPermission, Permission } from './permissions';

const issuer = `${config.keycloak.url}/realms/${config.keycloak.realm}`;
const jwks = createRemoteJWKSet(new URL(`${issuer}/protocol/openid-connect/certs`));

/**
 * Guard global: todo endpoint exige token salvo @Public. Los roles se leen de PostgreSQL en cada
 * solicitud, de modo que una suspension o cambio de rol aplica de inmediato.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly db: DbService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, targets)) return true;

    const request = context.switchToHttp().getRequest();
    const header: string = request.headers.authorization ?? '';
    if (!header.startsWith('Bearer ')) throw new UnauthorizedException('Sesión requerida');

    let sub: string;
    try {
      const { payload } = await jwtVerify(header.slice(7), jwks, {
        issuer,
        audience: 'iinicia-api',
        algorithms: ['RS256'],
      });
      sub = String(payload.sub);
    } catch {
      throw new UnauthorizedException('Token inválido o expirado');
    }

    const user = await this.db.one<AuthUser>(
      `SELECT u.id, u.oidc_sub AS sub, u.email, u.status,
              COALESCE(array_agg(DISTINCT r.role) FILTER (WHERE r.role IS NOT NULL), '{}') AS roles,
              COALESCE(array_agg(DISTINCT r.program_id::text) FILTER (WHERE r.program_id IS NOT NULL), '{}') AS "programIds"
         FROM users u LEFT JOIN user_roles r ON r.user_id = u.id
        WHERE u.oidc_sub = $1 GROUP BY u.id`,
      [sub],
    );
    if (!user) throw new UnauthorizedException('Cuenta no registrada');
    if (user.status === 'suspendido') throw new ForbiddenException('Cuenta suspendida');
    request.user = user;

    const permission = this.reflector.getAllAndOverride<Permission>(PERMISSION_KEY, targets);
    if (permission && !hasPermission(user.roles, permission)) {
      throw new ForbiddenException('No tienes permiso para esta acción');
    }
    return true;
  }
}
