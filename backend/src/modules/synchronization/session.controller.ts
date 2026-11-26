import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AuthUser, CurrentUser, RequirePermission } from '../auth/auth.decorators';
import { LogoutDto } from './session.dto';
import { SessionService } from './session.service';

@ApiTags('mi-iinicia')
@ApiBearerAuth()
@Controller({ path: 'me', version: '1' })
export class SessionController {
  constructor(private readonly sessions: SessionService) {}

  /**
   * Cierre de sesión coordinado (Fases 4.10 y 5). Lo llaman el portal (desde el servidor) y la app antes de borrar su
   * sesión local. Sin cuerpo (o scope=device) cierra solo este dispositivo; scope=all cierra todas las sesiones.
   * Responde qué servicios confirmaron el cierre; "complete" solo es true si todos lo hicieron. Es idempotente.
   */
  @Post('logout')
  @HttpCode(200)
  @ApiOperation({ summary: 'Cierra la sesión de este dispositivo (o todas) en Keycloak y Moodle' })
  logout(@CurrentUser() user: AuthUser, @Body() body: LogoutDto) {
    return this.sessions.logout(user, body?.scope ?? 'device');
  }
}

/**
 * Fase 5: respuesta a incidentes. Mismo permiso que suspender una cuenta (superadministrador y administrador
 * académico); solo un superadministrador actúa sobre otro superadministrador. Todo queda en la auditoría.
 */
@ApiTags('usuarios')
@ApiBearerAuth()
@Controller({ path: 'admin/users/:id/sessions', version: '1' })
export class AdminSessionController {
  constructor(private readonly sessions: SessionService) {}

  @Get()
  @RequirePermission('users:suspend')
  @ApiOperation({ summary: 'Sesiones activas de la persona en Keycloak (sin IP ni navegador)' })
  list(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.sessions.listSessions(actor, id);
  }

  @Delete(':sid')
  @RequirePermission('users:suspend')
  @ApiOperation({ summary: 'Revoca una sesión concreta (comprometida) y su campus' })
  revokeOne(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Param('sid', ParseUUIDPipe) sid: string, @Req() req: Request) {
    return this.sessions.revokeSession(actor, id, sid, req.ip);
  }

  @Post('revoke')
  @HttpCode(200)
  @RequirePermission('users:suspend')
  @ApiOperation({ summary: 'Revoca todas las sesiones de la persona por motivos de seguridad' })
  revokeAll(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.sessions.revokeAll(actor, id, req.ip);
  }
}
