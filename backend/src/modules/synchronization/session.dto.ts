import { IsInt, IsOptional, Min } from 'class-validator';

/** Cuerpo opcional de POST /me/logout (Fase 4.11). */
export class LogoutDto {
  /**
   * Hora (segundos Unix) en que la persona cerró sesión en la app sin conexión. El reintento la envía para que solo se
   * cierren las sesiones de Moodle anteriores a ese momento. El backend nunca la acepta en el futuro.
   */
  @IsOptional() @IsInt() @Min(0) requestedAt?: number;
}
