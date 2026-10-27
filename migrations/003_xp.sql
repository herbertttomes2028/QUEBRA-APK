-- XP e níveis (só ACRESCENTA: nenhuma tabela ou coluna existente é alterada ou apagada)
ALTER TABLE users ADD COLUMN IF NOT EXISTS xp integer NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS xp_seeded boolean NOT NULL DEFAULT false;     -- o XP do histórico antigo já foi calculado?

-- cada concessão de XP, uma única vez (user_id + ref é único: reconectar ou repetir a chamada NUNCA paga duas vezes)
CREATE TABLE IF NOT EXISTS xp_events (
  id         bigserial PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ref        text NOT NULL,
  kind       text NOT NULL,
  amount     integer NOT NULL,
  meta       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, ref)
);
CREATE INDEX IF NOT EXISTS xp_events_user_time ON xp_events (user_id, created_at DESC);

-- quantas vezes cada jogador já ganhou XP de cada quebra-cabeça (para a redução por repetição)
CREATE TABLE IF NOT EXISTS puzzle_clears (
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  puzzle_key text NOT NULL,
  clears     integer NOT NULL DEFAULT 0,
  last_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, puzzle_key)
);
