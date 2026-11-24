import { Injectable } from '@nestjs/common';
import { DbService } from '../../db/db.service';
import { KeycloakService } from '../../integrations/keycloak/keycloak.service';
import { MoodleService } from '../../integrations/moodle/moodle.service';

@Injectable()
export class HealthService {
  constructor(private readonly db: DbService, private readonly keycloak: KeycloakService, private readonly moodle: MoodleService) {}

  async status() {
    const [database, identidad, lms] = await Promise.all([
      this.db.one('SELECT 1 AS ok').then(() => true).catch(() => false),
      this.keycloak.health(),
      this.moodle.health(),
    ]);
    return {
      sistema: 'IINICIA',
      estado: database && identidad && lms ? 'operativo' : 'degradado',
      version: '1.0.0',
      servicios: { database, identidad, lms },
    };
  }
}
