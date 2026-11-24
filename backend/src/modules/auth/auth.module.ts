import { Module } from '@nestjs/common';
import { AuthGuard } from './auth.guard';

/**
 * Autenticación (token de Keycloak) y autorización (matriz RBAC). El guard se registra como global en
 * AppModule, después del límite de intentos, para conservar el orden de ejecución.
 */
@Module({ providers: [AuthGuard], exports: [AuthGuard] })
export class AuthModule {}
