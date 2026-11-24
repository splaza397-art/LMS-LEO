import { Module } from '@nestjs/common';
import { KeycloakService } from './keycloak.service';
import { MoodleService } from './moodle.service';

/** Únicos puntos de contacto con Keycloak y Moodle. Ningún otro código llama a sus API. */
@Module({ providers: [KeycloakService, MoodleService], exports: [KeycloakService, MoodleService] })
export class IntegrationsModule {}
