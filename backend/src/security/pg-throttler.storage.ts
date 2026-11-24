import type { ThrottlerStorage } from '@nestjs/throttler';
import { DbService } from '../db/db.service';

interface Row extends Record<string, unknown> { hits: number; expires_ms: number; block_ms: number }

/**
 * Contador de intentos en PostgreSQL, compartido por todas las instancias del backend. Con el almacén en
 * memoria por defecto, cada instancia contaba por su lado y N instancias permitían N veces el límite.
 * Ventana fija por clave y bloqueo durante blockDuration al superar el límite (misma semántica observable
 * que el almacén por defecto de @nestjs/throttler).
 */
export class PgThrottlerStorage implements ThrottlerStorage {
  private calls = 0;

  constructor(private readonly db: DbService) {}

  /** Limpieza ocasional de contadores vencidos (la tabla es UNLOGGED y solo guarda datos efímeros). */
  private sweep() {
    if (++this.calls % 500 !== 0) return;
    void this.db.query(
      `DELETE FROM throttle_counters WHERE window_ends_at < now() - interval '10 minutes'
         AND (blocked_until IS NULL OR blocked_until < now())`,
    ).catch(() => undefined);
  }

  async increment(key: string, ttl: number, limit: number, blockDuration: number, throttlerName: string) {
    this.sweep();
    const row = await this.db.one<Row>(
      `WITH upsert AS (
         INSERT INTO throttle_counters AS t (key, throttler, hits, window_ends_at)
         VALUES ($1, $2, 1, now() + $3 * interval '1 millisecond')
         ON CONFLICT (key, throttler) DO UPDATE SET
           hits = CASE WHEN t.window_ends_at <= now() THEN 1 ELSE t.hits + 1 END,
           window_ends_at = CASE WHEN t.window_ends_at <= now() THEN EXCLUDED.window_ends_at ELSE t.window_ends_at END,
           blocked_until = CASE
             WHEN t.blocked_until > now() THEN t.blocked_until
             WHEN (CASE WHEN t.window_ends_at <= now() THEN 1 ELSE t.hits + 1 END) > $4 THEN now() + $5 * interval '1 millisecond'
             ELSE NULL END
         RETURNING hits, window_ends_at, blocked_until
       )
       SELECT hits,
              GREATEST(0, CEIL(EXTRACT(EPOCH FROM (window_ends_at - now())) * 1000))::float8 AS expires_ms,
              GREATEST(0, CEIL(EXTRACT(EPOCH FROM (COALESCE(blocked_until, now()) - now())) * 1000))::float8 AS block_ms
         FROM upsert`,
      [key, throttlerName, ttl, limit, blockDuration],
    );
    const blockMs = Number(row!.block_ms);
    return {
      totalHits: Number(row!.hits),
      timeToExpire: Math.ceil(Number(row!.expires_ms) / 1000),
      isBlocked: blockMs > 0,
      timeToBlockExpire: Math.ceil(blockMs / 1000),
    };
  }
}
