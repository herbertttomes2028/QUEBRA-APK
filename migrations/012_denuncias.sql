-- Denúncias de jogadores (apelido, avatar ou comportamento).
-- Só quem cuida do jogo lê esta tabela (pelo SQL Editor do banco). A pessoa denunciada nunca é avisada nem vê quem denunciou.
-- Excluir uma conta apaga as denúncias feitas por ela e as feitas contra ela (mesma regra de todo o resto: ON DELETE CASCADE).
CREATE TABLE IF NOT EXISTS reports (
  id            bigserial PRIMARY KEY,
  reporter      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reported      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason        text NOT NULL CHECK (reason IN ('apelido', 'comportamento', 'outro')),
  context       text NOT NULL CHECK (context IN ('perfil', 'amigos', 'sala')),
  note          text NOT NULL DEFAULT '' CHECK (length(note) <= 200),
  reported_name text NOT NULL DEFAULT '' CHECK (length(reported_name) <= 40),   -- o apelido NO MOMENTO da denúncia (a pessoa pode trocá-lo depois)
  status        text NOT NULL DEFAULT 'novo' CHECK (status IN ('novo', 'analisado', 'resolvido')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (reporter <> reported)
);
CREATE INDEX IF NOT EXISTS reports_reported_idx ON reports (reported, created_at DESC);
CREATE INDEX IF NOT EXISTS reports_novos_idx ON reports (created_at DESC) WHERE status = 'novo';
