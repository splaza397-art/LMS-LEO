import { Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../auth/auth.decorators';
import { SessionService } from './session.service';

@ApiTags('mi-iinicia')
@ApiBearerAuth()
@Controller({ path: 'me', version: '1' })
export class SessionController {
  constructor(private readonly sessions: SessionService) {}

  /**
   * Cierre de sesión coordinado (Fase 4.10). Lo llaman el portal (desde el servidor) y la app antes de borrar su
   * sesión local. Responde qué servicios confirmaron el cierre; "complete" solo es true si todos lo hicieron.
   */
  @Post('logout')
  @HttpCode(200)
  @ApiOperation({ summary: 'Cierra la sesión de Keycloak del token y las sesiones de Moodle de la persona' })
  logout(@CurrentUser() user: AuthUser) {
    return this.sessions.logout(user);
  }
}
