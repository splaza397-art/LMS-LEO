import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { config } from '../../config';
import { UsersRepository } from '../users/users.repository';
import { PERMISSION_KEY, PUBLIC_KEY } from './auth.decorators';
import { hasPermission, Permission } from './permissions';

const issuer = `${config.keycloak.url}/realms/${config.keycloak.realm}`;
/**
 * Llaves públicas de Keycloak. Fase 5: se conservan 6 horas (jose usa 10 minutos por omisión). Con 10 minutos, si
 * Keycloak se detenía, la API rechazaba todos los tokens en cuanto vencía la copia, aunque fueran válidos (encontrado en
 * la prueba de fallas K0). Un token firmado con una llave desconocida (rotación) obliga a pedir las llaves otra vez
 * (cada 30 s como máximo). La firma, el emisor, la audiencia y el algoritmo se validan igual. Si se retira una llave
 * comprometida en Keycloak, reiniciar el backend para olvidarla de inmediato (documento 16, recuperación).
 */
const jwks = createRemoteJWKSet(new URL(`${issuer}/protocol/openid-connect/certs`), { cacheMaxAge: 6 * 60 * 60 * 1000 });

/**
 * Guard global: todo endpoint exige token salvo @Public. Los roles se leen de PostgreSQL en cada
 * solicitud, de modo que una suspension o cambio de rol aplica de inmediato.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly users: UsersRepository) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, targets)) return true;

    const request = context.switchToHttp().getRequest();
    const header: string = request.headers.authorization ?? '';
    if (!header.startsWith('Bearer ')) throw new UnauthorizedException('Sesión requerida');

    let sub: string;
    let sid: string | undefined;
    let iat: number | undefined;
    try {
      const { payload } = await jwtVerify(header.slice(7), jwks, {
        issuer,
        audience: 'iinicia-api',
        algorithms: ['RS256'],
      });
      sub = String(payload.sub);
      sid = typeof payload.sid === 'string' ? payload.sid : undefined;
      iat = typeof payload.iat === 'number' ? payload.iat : undefined;
    } catch {
      throw new UnauthorizedException('Token inválido o expirado');
    }

    const found = await this.users.findPrincipalBySub(sub, sid, iat);
    if (!found) throw new UnauthorizedException('Cuenta no registrada');
    const { sessionRevoked, ...user } = found;
    if (user.status === 'suspendido') throw new ForbiddenException('Cuenta suspendida');
    // Fase 5: un token de una sesión ya cerrada (en este dispositivo o en todos) no vale aunque no haya vencido.
    if (sessionRevoked) throw new UnauthorizedException('La sesión se cerró. Inicia sesión de nuevo.');
    request.user = { ...user, sid, iat };

    const permission = this.reflector.getAllAndOverride<Permission>(PERMISSION_KEY, targets);
    if (permission && !hasPermission(user.roles, permission)) {
      throw new ForbiddenException('No tienes permiso para esta acción');
    }
    return true;
  }
}
