CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS queues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  service_time INTEGER NOT NULL CHECK (service_time > 0),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'paused', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS queue_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id UUID NOT NULL REFERENCES queues(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  display_name TEXT NOT NULL,
  identifier TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'serving', 'served', 'left'))
);

CREATE INDEX IF NOT EXISTS queue_members_queue_waiting_idx
  ON queue_members(queue_id, status, joined_at);

CREATE UNIQUE INDEX IF NOT EXISTS queue_members_active_user_idx
  ON queue_members(queue_id, user_id) WHERE status IN ('waiting', 'serving');
