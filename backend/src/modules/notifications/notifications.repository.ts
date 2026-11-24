import { Injectable } from '@nestjs/common';
import { DbService } from '../../db/db.service';

/** Dueño de notifications y devices. */
@Injectable()
export class NotificationsRepository {
  constructor(private readonly db: DbService) {}

  create(userId: string, title: string, body: string, link: string | null) {
    return this.db.one(
      `INSERT INTO notifications (user_id, title, body, link) VALUES ($1, $2, $3, $4)
       RETURNING id, title, body, link, read_at AS "readAt", created_at AS "createdAt"`,
      [userId, title, body, link],
    );
  }

  list(userId: string) {
    return this.db.query(
      `SELECT id, title, body, link, read_at AS "readAt", created_at AS "createdAt"
         FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [userId],
    );
  }

  async markRead(userId: string, id: string): Promise<void> {
    await this.db.query(`UPDATE notifications SET read_at = COALESCE(read_at, now()) WHERE id = $1 AND user_id = $2`, [id, userId]);
  }

  async upsertDevice(userId: string, token: string, enabled: boolean): Promise<void> {
    await this.db.query(
      `INSERT INTO devices (token, user_id, notifications_enabled) VALUES ($1, $2, $3)
       ON CONFLICT (token) DO UPDATE SET user_id = EXCLUDED.user_id, notifications_enabled = EXCLUDED.notifications_enabled, updated_at = now()`,
      [token, userId, enabled],
    );
  }

  async removeDevice(userId: string, token: string): Promise<void> {
    await this.db.query(`DELETE FROM devices WHERE token = $1 AND user_id = $2`, [token, userId]);
  }
}
