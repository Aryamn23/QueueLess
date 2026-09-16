const { withDatabase } = require('./db');

function getClientId(req) {
  const value = req.headers['x-queueless-client-id'] || req.body?.clientId;
  if (!value || typeof value !== 'string' || value.length > 120) {
    const error = new Error('A browser client ID is required.');
    error.status = 400;
    throw error;
  }
  return value;
}

function body(req) { return req.body && typeof req.body === 'object' ? req.body : {}; }
function sendError(res, error) {
  const status = error.status || (error.code === '23505' ? 409 : error.code === 'MISSING_DATABASE_URL' ? 500 : 500);
  res.status(status).json({ error: error.message || 'A server error occurred.' });
}
async function getUser(sql, clientId) {
  const rows = await sql`INSERT INTO users (client_id) VALUES (${clientId}) ON CONFLICT (client_id) DO UPDATE SET client_id = EXCLUDED.client_id RETURNING id, client_id`;
  return rows[0];
}
function normalizeQueue(row, waiting = 0) {
  return { id: row.id, name: row.name, description: row.description, serviceTime: row.service_time, status: row.status, createdAt: row.created_at, waitingCount: Number(waiting), owned: row.owned === true };
}
function normalizeMember(row, serviceTime) {
  const position = Number(row.position || 0);
  return { id: row.id, queueId: row.queue_id, name: row.display_name, identifier: row.identifier, position: row.status === 'waiting' ? position : 0, peopleAhead: row.status === 'waiting' ? Math.max(0, position - 1) : 0, estimatedWait: row.status === 'waiting' ? Math.max(0, position - 1) * serviceTime : 0, joinedAt: row.joined_at, status: row.status };
}
async function queueDetails(sql, queueId, includeMembers = true) {
  const queues = await sql`SELECT * FROM queues WHERE id = ${queueId}`;
  if (!queues[0]) { const error = new Error('Queue not found.'); error.status = 404; throw error; }
  const queue = queues[0];
  const waiting = await sql`SELECT COUNT(*)::int AS count FROM queue_members WHERE queue_id = ${queueId} AND status = 'waiting'`;
  const result = normalizeQueue(queue, waiting[0].count);
  if (includeMembers) {
    const members = await sql`SELECT * FROM queue_members WHERE queue_id = ${queueId} AND status IN ('waiting', 'serving') ORDER BY CASE WHEN status = 'serving' THEN 0 ELSE 1 END, position, joined_at`;
    result.members = members.map(member => normalizeMember(member, queue.service_time));
  }
  return result;
}
async function recalculatePositions(sql, queueId) {
  await sql`
    WITH ranked AS (
      SELECT id, ROW_NUMBER() OVER (ORDER BY joined_at, id)::int AS next_position
      FROM queue_members
      WHERE queue_id = ${queueId} AND status = 'waiting'
    )
    UPDATE queue_members members
    SET position = ranked.next_position
    FROM ranked
    WHERE members.id = ranked.id
  `;
}
async function listQueues(req, res) {
  try { const result = await withDatabase(async sql => { const user = await getUser(sql, getClientId(req)); const rows = await sql`SELECT q.*, q.owner_user_id = ${user.id} AS owned, COUNT(m.id)::int AS waiting_count FROM queues q LEFT JOIN queue_members m ON m.queue_id = q.id AND m.status = 'waiting' GROUP BY q.id ORDER BY q.created_at DESC`; return rows.map(row => normalizeQueue(row, row.waiting_count)); }); res.json(result); } catch (error) { sendError(res, error); }
}
async function createQueue(req, res) {
  try {
    const data = body(req); const name = String(data.name || '').trim(); const description = String(data.description || '').trim(); const serviceTime = Number(data.serviceTime);
    if (!name || !Number.isInteger(serviceTime) || serviceTime < 1 || serviceTime > 240) { const error = new Error('Queue name and a service time from 1 to 240 minutes are required.'); error.status = 400; throw error; }
    const result = await withDatabase(async sql => { const user = await getUser(sql, getClientId(req)); const rows = await sql`INSERT INTO queues (owner_user_id, name, description, service_time) VALUES (${user.id}, ${name}, ${description}, ${serviceTime}) RETURNING *`; return normalizeQueue({ ...rows[0], owned: true }, 0); });
    res.status(201).json(result);
  } catch (error) { sendError(res, error); }
}
async function handleQueue(req, res, queueId) {
  try {
    const action = req.query.action || 'details';
    const result = await withDatabase(async sql => {
      const queue = await queueDetails(sql, queueId, true);
      if (action === 'details' && req.method === 'GET') return queue;
      const user = await getUser(sql, getClientId(req));
      if (action === 'join' && req.method === 'POST') {
        if (queue.status !== 'open') { const error = new Error(`Queue is ${queue.status} and cannot accept new members.`); error.status = 409; throw error; }
        const data = body(req); const name = String(data.name || '').trim();
        if (!name) { const error = new Error('Your name is required.'); error.status = 400; throw error; }
        const existing = await sql`SELECT id FROM queue_members WHERE queue_id = ${queueId} AND user_id = ${user.id} AND status IN ('waiting', 'serving')`;
        if (existing[0]) { const error = new Error('You are already in this queue.'); error.status = 409; throw error; }
        const next = await sql`SELECT COALESCE(MAX(position), 0)::int + 1 AS position FROM queue_members WHERE queue_id = ${queueId} AND status = 'waiting'`;
        const rows = await sql`INSERT INTO queue_members (queue_id, user_id, display_name, identifier, position) VALUES (${queueId}, ${user.id}, ${name}, ${String(data.identifier || '').trim()}, ${next[0].position}) RETURNING *`;
        await recalculatePositions(sql, queueId);
        return { queue: await queueDetails(sql, queueId), member: normalizeMember(rows[0], queue.serviceTime) };
      }
      if (action === 'position' && req.method === 'GET') {
        const rows = await sql`SELECT m.* FROM queue_members m WHERE m.queue_id = ${queueId} AND m.user_id = ${user.id} AND m.status IN ('waiting', 'serving') ORDER BY m.joined_at DESC LIMIT 1`;
        if (!rows[0]) { const error = new Error('You are not currently in this queue.'); error.status = 404; throw error; }
        return normalizeMember(rows[0], queue.serviceTime);
      }
      const owner = await sql`SELECT id FROM queues WHERE id = ${queueId} AND owner_user_id = ${user.id}`;
      if (!owner[0]) { const error = new Error('Only the queue creator can manage this queue.'); error.status = 403; throw error; }
      if (['pause', 'resume', 'close'].includes(action) && req.method === 'POST') { const status = action === 'pause' ? 'paused' : action === 'resume' ? 'open' : 'closed'; await sql`UPDATE queues SET status = ${status} WHERE id = ${queueId}`; return queueDetails(sql, queueId); }
      if (action === 'next' && req.method === 'POST') {
        const current = await sql`SELECT * FROM queue_members WHERE queue_id = ${queueId} AND status = 'serving' ORDER BY joined_at LIMIT 1`; if (current[0]) await sql`UPDATE queue_members SET status = 'served' WHERE id = ${current[0].id}`;
        const next = await sql`SELECT * FROM queue_members WHERE queue_id = ${queueId} AND status = 'waiting' ORDER BY position, joined_at LIMIT 1`;
        if (!next[0]) return { queue: await queueDetails(sql, queueId), member: null };
        await sql`UPDATE queue_members SET status = 'serving', position = 0 WHERE id = ${next[0].id}`;
        await recalculatePositions(sql, queueId);
        return { queue: await queueDetails(sql, queueId), member: normalizeMember({ ...next[0], status: 'serving', position: 0 }, queue.serviceTime) };
      }
      if (action === 'remove' && req.method === 'POST') {
        const memberId = String(body(req).memberId || '');
        if (!memberId) { const error = new Error('A queue member is required.'); error.status = 400; throw error; }
        await sql`UPDATE queue_members SET status = 'left' WHERE id = ${memberId} AND queue_id = ${queueId} AND status IN ('waiting', 'serving')`;
        await recalculatePositions(sql, queueId);
        return queueDetails(sql, queueId);
      }
      const error = new Error('Unsupported queue action.'); error.status = 400; throw error;
    });
    res.json(result);
  } catch (error) { sendError(res, error); }
}
async function handleMember(req, res, memberId) {
  try {
    if (req.method !== 'POST' || req.query.action !== 'leave') { const error = new Error('Unsupported member action.'); error.status = 400; throw error; }
    const result = await withDatabase(async sql => { const user = await getUser(sql, getClientId(req)); const rows = await sql`UPDATE queue_members SET status = 'left' WHERE id = ${memberId} AND user_id = ${user.id} AND status IN ('waiting', 'serving') RETURNING queue_id`; if (!rows[0]) { const error = new Error('Queue member not found.'); error.status = 404; throw error; } await recalculatePositions(sql, rows[0].queue_id); return queueDetails(sql, rows[0].queue_id); });
    res.json(result);
  } catch (error) { sendError(res, error); }
}
module.exports = { listQueues, createQueue, handleQueue, handleMember };
