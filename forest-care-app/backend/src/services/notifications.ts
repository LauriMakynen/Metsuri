import type { PoolClient } from 'pg';

export type NotificationType =
  | 'new_bid'
  | 'bid_no_longer_best'
  | 'bid_removed'
  | 'work_request_cancelled';

export interface NewNotification {
  userId: number;
  type: NotificationType;
  title: string;
  body: string;
  link: string;
}

export async function createNotification(
  client: PoolClient,
  notification: NewNotification
): Promise<void> {
  await client.query(
    `INSERT INTO notifications (user_id, type, title, body, link)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      notification.userId,
      notification.type,
      notification.title,
      notification.body,
      notification.link,
    ]
  );
}
