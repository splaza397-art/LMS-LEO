import { Global, Module } from '@nestjs/common';
import { DbService } from './db.service';

/** Una sola instancia de DbService (un pool) para toda la aplicación. */
@Global()
@Module({ providers: [DbService], exports: [DbService] })
export class DbModule {}
