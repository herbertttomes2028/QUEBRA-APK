-- 005: Gemas gratuitas, apenas CRÉDITO, sem loja e sem gasto.
-- Migração aditiva: não modifica as migrações anteriores.
ALTER TABLE users ADD COLUMN IF NOT EXISTS gems integer NOT NULL DEFAULT 0;

-- Registros de crédito idempotentes: uma partida e cada nível, no máximo uma vez por conta.
CREATE TABLE IF NOT EXISTS gem_events (
  id         bigserial PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ref        text NOT NULL,
  kind       text NOT NULL CHECK (kind IN ('match', 'level')),
  amount     integer NOT NULL CHECK (amount > 0),
  meta       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, ref)
);
CREATE INDEX IF NOT EXISTS gem_events_user_time ON gem_events (user_id, created_at DESC);
