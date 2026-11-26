import { IsIn, IsOptional } from 'class-validator';

/** Cuerpo opcional de POST /me/logout (Fase 5). Sin cuerpo: cierre de este dispositivo, como antes. */
export class LogoutDto {
  /** device: solo la sesión de este dispositivo. all: todas las sesiones de la persona (en todos los dispositivos). */
  @IsOptional() @IsIn(['device', 'all']) scope?: 'device' | 'all';
}
