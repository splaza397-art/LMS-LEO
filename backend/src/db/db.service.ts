import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Pool, PoolClient, QueryResultRow } from 'pg';
import { config } from '../config';

export type Queryable = Pick<PoolClient, 'query'>;

@Injectable()
export class DbService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DbService.name);
  readonly pool = new Pool({ connectionString: config.databaseUrl, max: 10 });
  /**
   * Conexiones dedicadas a sostener bloqueos consultivos. Van aparte para que quien espera un bloqueo nunca
   * agote las conexiones que necesita quien ya lo tiene.
   */
  private readonly lockPool = new Pool({ connectionString: config.databaseUrl, max: 5 });

  constructor() {
    // Si PostgreSQL cierra una conexión inactiva (reinicio, recuperación), pg emite "error" en el pool. Sin este
    // manejador, Node termina el proceso del backend completo. La conexión dañada se descarta y el pool abre otra.
    for (const pool of [this.pool, this.lockPool]) {
      pool.on('error', (error) => this.logger.error(`Conexión inactiva a PostgreSQL cerrada: ${error.message}`));
    }
  }

  async onModuleInit() {
    await this.migrate();
  }

  async onModuleDestroy() {
    await Promise.all([this.pool.end(), this.lockPool.end()]);
  }

  async query<T extends QueryResultRow>(sql: string, params: unknown[] = []): Promise<T[]> {
    return (await this.pool.query<T>(sql, params)).rows;
  }

  async one<T extends QueryResultRow>(sql: string, params: unknown[] = []): Promise<T | null> {
    return (await this.query<T>(sql, params))[0] ?? null;
  }

  async tx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Exclusion mutua entre procesos e instancias con un bloqueo consultivo de PostgreSQL (nivel de sesion).
   * Si el proceso muere, PostgreSQL libera el bloqueo al cerrarse la conexion.
   * Con waitMs = 0 no espera: devuelve { acquired: false } si otro lo tiene.
   */
  async withLock<T>(key: string, waitMs: number, fn: () => Promise<T>): Promise<{ acquired: true; result: T } | { acquired: false }> {
    const client = await this.lockPool.connect();
    let broken = false;
    try {
      const deadline = Date.now() + waitMs;
      for (;;) {
        const { rows } = await client.query<{ ok: boolean }>('SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS ok', [key]);
        if (rows[0].ok) break;
        if (Date.now() >= deadline) return { acquired: false };
        await new Promise((resolve) => setTimeout(resolve, 100 + Math.floor(Math.random() * 150)));
      }
      try {
        return { acquired: true, result: await fn() };
      } finally {
        // Si no se puede liberar, se descarta la conexion: al cerrarse, PostgreSQL suelta el bloqueo.
        await client.query('SELECT pg_advisory_unlock(hashtextextended($1, 0))', [key]).catch(() => { broken = true; });
      }
    } catch (error) {
      broken = true;
      throw error;
    } finally {
      client.release(broken);
    }
  }

  private async migrate() {
    const dir = join(__dirname, 'migrations');
    const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
    await this.tx(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(727274)');
      await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
      const { rows } = await client.query<{ name: string }>('SELECT name FROM schema_migrations');
      const applied = new Set(rows.map((r) => r.name));
      for (const file of files.filter((f) => !applied.has(f))) {
        await client.query(readFileSync(join(dir, file), 'utf8'));
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        this.logger.log(`Migracion aplicada: ${file}`);
      }
    });
  }
}
