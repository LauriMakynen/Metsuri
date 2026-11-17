import express, { Router, Response } from 'express';
import pool from '../db/pool';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { createNotification } from '../services/notifications';

const router = Router();
const MAX_MESSAGE_LENGTH = 4000;
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const imageParser = express.json({ limit: '6mb' });
const PRESENCE_TIMEOUT_SECONDS = 30;
const MAX_EUR = 10_000_000;

async function getChat(chatId: string, userId: number) {
  const result = await pool.query(
    `SELECT c.id, c.work_request_id, c.owner_id, c.provider_id, wr.title, wr.pricing,
            u.email AS other_email,
            bid.id AS bid_id, bid.amount_eur AS bid_amount_eur, bid.status AS bid_status,
            CASE WHEN c.owner_id = $2 THEN c.provider_id ELSE c.owner_id END AS other_user_id
     FROM work_request_chats c
     JOIN work_requests wr ON wr.id = c.work_request_id
     JOIN users u ON u.id = CASE WHEN c.owner_id = $2 THEN c.provider_id ELSE c.owner_id END
     LEFT JOIN work_request_bids bid ON bid.id = c.bid_id
     WHERE c.id = $1 AND ($2 = c.owner_id OR $2 = c.provider_id)`,
    [chatId, userId]
  );
  return result.rows[0] as {
    id: number; work_request_id: number; owner_id: number; provider_id: number;
    title: string; pricing: 'owner_receives' | 'owner_pays'; other_user_id: number; other_email: string;
    bid_id: number | null; bid_amount_eur: string | null; bid_status: 'pending' | 'accepted' | 'withdrawn' | null;
  } | undefined;
}

async function notifyChatParticipant(
  client: Parameters<typeof createNotification>[0],
  chatId: number,
  userId: number,
  notification: Parameters<typeof createNotification>[1]
): Promise<void> {
  const active = await client.query(
    `SELECT EXISTS (
       SELECT 1 FROM chat_presence
       WHERE user_id = $1 AND chat_id = $2
         AND last_seen_at > NOW() - INTERVAL '${PRESENCE_TIMEOUT_SECONDS} seconds'
     ) AS active`,
    [userId, chatId]
  ) as { rows: Array<{ active: boolean }> };
  if (!active.rows[0].active) await createNotification(client, notification);
}

router.use(authMiddleware);

router.post('/:id/presence', async (req: AuthRequest, res: Response): Promise<void> => {
  const chat = await getChat(req.params.id, req.userId as number);
  if (!chat) {
    res.status(404).json({ error: 'Keskustelua ei löytynyt' });
    return;
  }
  try {
    await pool.query(
      `INSERT INTO chat_presence (user_id, chat_id, last_seen_at) VALUES ($1, $2, NOW())
       ON CONFLICT (user_id, chat_id) DO UPDATE SET last_seen_at = NOW()`,
      [req.userId, chat.id]
    );
    res.status(204).send();
  } catch (error) {
    console.error('Update chat presence error:', error);
    res.status(500).json({ error: 'Chatin aktiivisuuden päivitys epäonnistui' });
  }
});

router.delete('/:id/presence', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await pool.query('DELETE FROM chat_presence WHERE user_id = $1 AND chat_id = $2', [req.userId, req.params.id]);
    res.status(204).send();
  } catch (error) {
    console.error('Delete chat presence error:', error);
    res.status(500).json({ error: 'Chatin aktiivisuuden poistaminen epäonnistui' });
  }
});

router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await pool.query(
      `SELECT c.id, c.work_request_id, c.owner_id, c.provider_id, wr.title, c.created_at,
              CASE WHEN c.owner_id = $1 THEN c.provider_id ELSE c.owner_id END AS other_user_id,
              u.email AS other_email,
              m.body AS last_message, m.created_at AS last_message_at,
              COALESCE(unread.unread_count, 0)::int AS unread_count
       FROM work_request_chats c
       JOIN work_requests wr ON wr.id = c.work_request_id
       JOIN users u ON u.id = CASE WHEN c.owner_id = $1 THEN c.provider_id ELSE c.owner_id END
       LEFT JOIN LATERAL (
         SELECT body, created_at FROM chat_messages WHERE chat_id = c.id ORDER BY created_at DESC, id DESC LIMIT 1
       ) m ON true
       LEFT JOIN LATERAL (
         SELECT COUNT(*) AS unread_count
         FROM chat_messages cm
         WHERE cm.chat_id = c.id AND cm.sender_id <> $1 AND cm.read_at IS NULL
       ) unread ON true
       WHERE (c.owner_id = $1 OR c.provider_id = $1)
         AND CASE WHEN c.owner_id = $1 THEN c.owner_deleted_at IS NULL ELSE c.provider_deleted_at IS NULL END
       ORDER BY COALESCE(m.created_at, c.created_at) DESC`,
      [req.userId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get chats error:', error);
    res.status(500).json({ error: 'Chatien lataaminen epäonnistui' });
  }
});

router.delete('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const chat = await getChat(req.params.id, req.userId as number);
  if (!chat) {
    res.status(404).json({ error: 'Keskustelua ei löytynyt' });
    return;
  }
  try {
    const column = chat.owner_id === req.userId ? 'owner_deleted_at' : 'provider_deleted_at';
    await pool.query(`UPDATE work_request_chats SET ${column} = NOW() WHERE id = $1`, [chat.id]);
    res.status(204).send();
  } catch (error) {
    console.error('Delete chat error:', error);
    res.status(500).json({ error: 'Chatin poistaminen epäonnistui' });
  }
});

router.get('/:id/messages', async (req: AuthRequest, res: Response): Promise<void> => {
  const chat = await getChat(req.params.id, req.userId as number);
  if (!chat) {
    res.status(404).json({ error: 'Keskustelua ei löytynyt' });
    return;
  }
  try {
    await pool.query(
      'UPDATE chat_messages SET read_at = NOW() WHERE chat_id = $1 AND sender_id <> $2 AND read_at IS NULL',
      [chat.id, req.userId]
    );
    const result = await pool.query(
      `SELECT id, sender_id, body, encode(image_data, 'base64') AS image_base64,
              image_type, counter_offer_eur, counter_offer_status, created_at
       FROM chat_messages WHERE chat_id = $1 ORDER BY created_at ASC, id ASC`,
      [chat.id]
    );
    res.json({ chat, messages: result.rows });
  } catch (error) {
    console.error('Get chat messages error:', error);
    res.status(500).json({ error: 'Viestien lataaminen epäonnistui' });
  }
});

router.post('/:id/messages', imageParser, async (req: AuthRequest, res: Response): Promise<void> => {
  const chat = await getChat(req.params.id, req.userId as number);
  if (!chat) {
    res.status(404).json({ error: 'Keskustelua ei löytynyt' });
    return;
  }
  const body = typeof req.body?.body === 'string' ? req.body.body.trim() : '';
  const imageBase64 = typeof req.body?.image_base64 === 'string' ? req.body.image_base64 : '';
  const imageType = typeof req.body?.image_type === 'string' ? req.body.image_type : null;
  const counterOffer = req.body?.counter_offer_eur === undefined ? null : Number(req.body.counter_offer_eur);
  if (body.length > MAX_MESSAGE_LENGTH || (!body && !imageBase64 && (counterOffer === null || !Number.isFinite(counterOffer)))) {
    res.status(400).json({ error: 'Viesti on tyhjä tai liian pitkä' });
    return;
  }
  if (imageBase64 && (!imageType?.startsWith('image/') || Buffer.byteLength(imageBase64, 'base64') > MAX_IMAGE_BYTES)) {
    res.status(400).json({ error: 'Kuva on virheellinen tai liian suuri' });
    return;
  }
  if (counterOffer !== null && (!Number.isFinite(counterOffer) || counterOffer <= 0 || counterOffer > 10_000_000)) {
    res.status(400).json({ error: 'Vastatarjouksen summa on virheellinen' });
    return;
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (counterOffer !== null) {
      await client.query(
        `UPDATE chat_messages
         SET counter_offer_status = 'declined'
         WHERE chat_id = $1 AND counter_offer_status = 'pending'`,
        [chat.id]
      );
    }
    const result = await client.query(
      `INSERT INTO chat_messages
       (chat_id, sender_id, body, image_data, image_type, counter_offer_eur, counter_offer_status)
       VALUES ($1, $2, $3, $4, $5, $6, CASE WHEN $6::numeric IS NULL THEN NULL ELSE 'pending' END)
       RETURNING id, sender_id, body, encode(image_data, 'base64') AS image_base64,
                 image_type, counter_offer_eur, counter_offer_status, created_at`,
      [chat.id, req.userId, body || null, imageBase64 ? Buffer.from(imageBase64, 'base64') : null, imageType, counterOffer]
    );
    await client.query(
      `UPDATE work_request_chats SET owner_deleted_at = NULL, provider_deleted_at = NULL WHERE id = $1`,
      [chat.id]
    );
    await client.query('COMMIT');
    await notifyChatParticipant(client, chat.id, chat.other_user_id, {
       userId: chat.other_user_id,
       type: 'chat_message',
       title: 'Uusi chat-viesti',
       body: `Uusi viesti työpyyntöön ${chat.title}.`,
       link: `/chat/${chat.id}`,
    });
    res.status(201).json(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Create chat message error:', error);
    res.status(500).json({ error: 'Viestin lähettäminen epäonnistui' });
  } finally {
    client.release();
  }
});

router.post('/:id/messages/:messageId/accept', async (req: AuthRequest, res: Response): Promise<void> => {
  const chat = await getChat(req.params.id, req.userId as number);
  if (!chat) {
    res.status(404).json({ error: 'Keskustelua ei löytynyt' });
    return;
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `UPDATE chat_messages SET counter_offer_status = 'accepted'
       WHERE id = $1 AND chat_id = $2 AND sender_id <> $3 AND counter_offer_status = 'pending'
       RETURNING id, counter_offer_eur`,
      [req.params.messageId, chat.id, req.userId]
    );
    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(400).json({ error: 'Vastatarjousta ei voi hyväksyä' });
      return;
    }
    const bid = await client.query(
      `UPDATE work_request_bids SET amount_eur = $1, status = 'accepted'
       WHERE id = $2 AND status IN ('pending', 'withdrawn')
       RETURNING amount_eur`,
      [result.rows[0].counter_offer_eur, chat.bid_id]
    );
    if (bid.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(400).json({ error: 'Tarjousta ei voi enää hyväksyä' });
      return;
    }
    await client.query(
      `UPDATE work_requests SET status = 'closed', updated_at = NOW()
       WHERE id = $1 AND status = 'open'`,
      [chat.work_request_id]
    );
    const amountText = Number(result.rows[0].counter_offer_eur).toLocaleString('fi-FI');
    await client.query(
      `INSERT INTO chat_messages (chat_id, sender_id, body)
       VALUES ($1, $2, $3)`,
      [chat.id, req.userId, `Tarjous ${amountText} € hyväksytty.`]
    );
    await notifyChatParticipant(client, chat.id, chat.other_user_id, {
      userId: chat.other_user_id,
      type: 'chat_message',
      title: 'Vastatarjous hyväksytty',
      body: `Tarjous ${amountText} € hyväksyttiin.`,
      link: `/chat/${chat.id}`,
    });
    await client.query('COMMIT');
    res.json(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Accept counter offer error:', error);
    res.status(500).json({ error: 'Vastatarjouksen hyväksyminen epäonnistui' });
  } finally {
    client.release();
  }
});

router.post('/:id/offer/accept', async (req: AuthRequest, res: Response): Promise<void> => {
  const chat = await getChat(req.params.id, req.userId as number);
  if (!chat || chat.owner_id !== req.userId) {
    res.status(404).json({ error: 'Tarjousta ei löytynyt' });
    return;
  }
  if (!chat.bid_id || chat.bid_status !== 'pending') {
    res.status(400).json({ error: 'Tarjousta ei voi enää hyväksyä' });
    return;
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `UPDATE work_request_bids
       SET status = 'accepted'
       WHERE id = $1 AND status = 'pending'
       RETURNING amount_eur`,
      [chat.bid_id]
    );
    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(400).json({ error: 'Tarjousta ei voi enää hyväksyä' });
      return;
    }
    await client.query(
      `UPDATE work_requests SET status = 'closed', updated_at = NOW()
       WHERE id = $1 AND status = 'open'`,
      [chat.work_request_id]
    );
    const amountText = Number(result.rows[0].amount_eur).toLocaleString('fi-FI');
    await client.query(
      `INSERT INTO chat_messages (chat_id, sender_id, body)
       VALUES ($1, $2, $3)`,
      [chat.id, req.userId, `Tarjous ${amountText} € hyväksytty.`]
    );
    await notifyChatParticipant(client, chat.id, chat.provider_id, {
      userId: chat.provider_id,
      type: 'chat_message',
      title: 'Tarjouksesi hyväksyttiin',
      body: `Tarjous ${amountText} € hyväksyttiin.`,
      link: `/chat/${chat.id}`,
    });

    await client.query('COMMIT');
    res.json({ status: 'accepted', amount_eur: result.rows[0].amount_eur });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Accept bid error:', error);
    res.status(500).json({ error: 'Tarjouksen hyväksyminen epäonnistui' });
  } finally {
    client.release();
  }
});

router.post('/:id/offer/new', async (req: AuthRequest, res: Response): Promise<void> => {
  const chat = await getChat(req.params.id, req.userId as number);
  const amount = Number(req.body?.amount_eur);
  if (!chat || (chat.provider_id !== req.userId && chat.owner_id !== req.userId) || chat.bid_status !== 'withdrawn') {
    res.status(400).json({ error: 'Uutta tarjousta ei voi tehdä tässä chatissa' });
    return;
  }
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_EUR) {
    res.status(400).json({ error: `Tarjouksen pitää olla 0–${MAX_EUR} €` });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const request = await client.query(
      'SELECT title, status FROM work_requests WHERE id = $1 FOR UPDATE',
      [chat.work_request_id]
    );
    if (request.rows.length === 0 || request.rows[0].status !== 'open') {
      await client.query('ROLLBACK');
      res.status(400).json({ error: 'Työpyyntö ei ole enää avoinna' });
      return;
    }
    await client.query(
      `UPDATE chat_messages
       SET counter_offer_status = 'declined'
       WHERE chat_id = $1 AND counter_offer_status = 'pending'`,
      [chat.id]
    );
    if (chat.provider_id === req.userId) {
      const bid = await client.query(
        `UPDATE work_request_bids
         SET amount_eur = $1, status = 'pending'
         WHERE id = $2 AND status = 'withdrawn'
         RETURNING amount_eur`,
        [Math.round(amount * 100) / 100, chat.bid_id]
      );
      if (bid.rows.length === 0) {
        await client.query('ROLLBACK');
        res.status(400).json({ error: 'Tarjousta ei voi enää avata uudelleen' });
        return;
      }
    }
    const message = await client.query(
      `INSERT INTO chat_messages
       (chat_id, sender_id, counter_offer_eur, counter_offer_status)
       VALUES ($1, $2, $3, 'pending')
       RETURNING id, sender_id, body, encode(image_data, 'base64') AS image_base64,
                 image_type, counter_offer_eur, counter_offer_status, created_at`,
      [chat.id, req.userId, Math.round(amount * 100) / 100]
    );
    await client.query(
      `UPDATE work_request_chats
       SET owner_deleted_at = NULL, provider_deleted_at = NULL
       WHERE id = $1`,
      [chat.id]
    );
    const amountText = amount.toLocaleString('fi-FI', { maximumFractionDigits: 2 });
    await notifyChatParticipant(client, chat.id, chat.other_user_id, {
      userId: chat.other_user_id,
      type: 'chat_message',
      title: `Uusi tarjous ${amountText} € työpyyntöön ${request.rows[0].title}`,
      body: 'Uusi tarjous on tullut chattiin.',
      link: `/chat/${chat.id}`,
    });
    await client.query('COMMIT');
    res.status(201).json(message.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Create replacement bid error:', error);
    res.status(500).json({ error: 'Uuden tarjouksen lähettäminen epäonnistui' });
  } finally {
    client.release();
  }
});

router.post('/:id/messages/:messageId/reject', async (req: AuthRequest, res: Response): Promise<void> => {
  const chat = await getChat(req.params.id, req.userId as number);
  if (!chat) {
    res.status(404).json({ error: 'Keskustelua ei löytynyt' });
    return;
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `UPDATE chat_messages
       SET counter_offer_status = 'declined'
       WHERE id = $1 AND chat_id = $2 AND sender_id <> $3 AND counter_offer_status = 'pending'
       RETURNING id`,
      [req.params.messageId, chat.id, req.userId]
    );
    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(400).json({ error: 'Tarjousta ei voi hylätä' });
      return;
    }
    await client.query(
      `UPDATE work_request_bids
       SET status = 'withdrawn'
       WHERE id = $1 AND status = 'pending'`,
      [chat.bid_id]
    );
    await client.query('COMMIT');
    res.json(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Reject counter offer error:', error);
    res.status(500).json({ error: 'Tarjouksen hylkääminen epäonnistui' });
  } finally {
    client.release();
  }
});

router.post('/:id/offer/cancel', async (req: AuthRequest, res: Response): Promise<void> => {
  const chat = await getChat(req.params.id, req.userId as number);
  if (!chat || chat.bid_status !== 'accepted') {
    res.status(400).json({ error: 'Hyväksyttyä tarjousta ei voi perua' });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `UPDATE work_request_bids SET status = 'withdrawn'
       WHERE id = $1 AND status = 'accepted'
       RETURNING amount_eur`,
      [chat.bid_id]
    );
    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(400).json({ error: 'Hyväksyttyä tarjousta ei voi enää perua' });
      return;
    }
    await client.query(
      `UPDATE work_requests SET status = 'open', updated_at = NOW()
       WHERE id = $1 AND status = 'closed'`,
      [chat.work_request_id]
    );
    const amountText = Number(result.rows[0].amount_eur).toLocaleString('fi-FI');
    await client.query(
      `INSERT INTO chat_messages (chat_id, sender_id, body)
       VALUES ($1, $2, $3)`,
      [chat.id, req.userId, `Tarjous ${amountText} € peruttu.`]
    );
    await notifyChatParticipant(client, chat.id, chat.other_user_id, {
      userId: chat.other_user_id,
      type: 'chat_message',
      title: 'Hyväksytty tarjous peruttiin',
      body: `Työpyynnön ${chat.title} hyväksytty tarjous peruttiin.`,
      link: `/chat/${chat.id}`,
    });
    await client.query('COMMIT');
    res.json({ status: 'withdrawn', amount_eur: result.rows[0].amount_eur });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Cancel accepted bid error:', error);
    res.status(500).json({ error: 'Tarjouksen peruminen epäonnistui' });
  } finally {
    client.release();
  }
});

export default router;
