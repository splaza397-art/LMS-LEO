import { Controller, Get, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/auth.decorators';
import { HealthService } from './health.service';

@ApiTags('estado')
@Public()
@Controller({ version: VERSION_NEUTRAL })
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get('estado')
  status() {
    return this.health.status();
  }
}
