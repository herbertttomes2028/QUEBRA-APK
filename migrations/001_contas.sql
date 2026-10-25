-- Contas, amizades, convites, progresso salvo e histórico do Quebra-cabeça a dois.
-- Privacidade: guardamos o mínimo (e-mail só para entrar, nome e avatar de jogo). O e-mail NUNCA é mostrado a outros jogadores.

CREATE TABLE IF NOT EXISTS users (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email       text UNIQUE,                                  -- sempre em minúsculas
  pass_hash   text,                                         -- scrypt (nunca a senha em si)
  google_sub  text UNIQUE,                                  -- identificador da conta Google (opcional)
  name        text NOT NULL,
  avatar      text NOT NULL DEFAULT '',
  friend_code text NOT NULL UNIQUE,                         -- código público para achar amigos
  bests       jsonb NOT NULL DEFAULT '{}'::jsonb,           -- melhores tempos trazidos do modo visitante
  consent_at  timestamptz NOT NULL DEFAULT now(),           -- quando o aviso de privacidade foi aceito
  created_at  timestamptz NOT NULL DEFAULT now(),
  last_seen   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_tem_login CHECK (email IS NOT NULL OR google_sub IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash text PRIMARY KEY,                              -- só o hash do token; o token em si fica no aparelho
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);

-- uma linha por par de amigos (user_a < user_b); "requested_by" diz quem pediu
CREATE TABLE IF NOT EXISTS friendships (
  user_a       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_b       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status       text NOT NULL CHECK (status IN ('pending', 'accepted')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  accepted_at  timestamptz,
  PRIMARY KEY (user_a, user_b),
  CHECK (user_a < user_b)
);
CREATE INDEX IF NOT EXISTS friendships_b_idx ON friendships(user_b);

CREATE TABLE IF NOT EXISTS invites (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('coop', 'comum', 'quebra')),
  room_code   text NOT NULL,
  image_label text NOT NULL DEFAULT '',
  pieces      integer NOT NULL,
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'expired')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  responded_at timestamptz
);
CREATE INDEX IF NOT EXISTS invites_to_idx ON invites(to_user, status);
CREATE INDEX IF NOT EXISTS invites_from_idx ON invites(from_user, status);

-- a última partida inacabada de cada jogador (para "Continuar jogando")
CREATE TABLE IF NOT EXISTS saves (
  user_id      uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  image_id     text NOT NULL,
  image_label  text NOT NULL DEFAULT '',
  pieces       integer NOT NULL,
  locked       jsonb NOT NULL DEFAULT '[]'::jsonb,          -- números das peças já encaixadas
  elapsed_ms   bigint NOT NULL DEFAULT 0,
  partner_name text NOT NULL DEFAULT '',
  custom_image bytea,                                       -- imagem própria (JPEG), quando houver
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS matches (
  id          bigserial PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mode        text NOT NULL CHECK (mode IN ('coop', 'comum', 'quebra')),
  image_label text NOT NULL DEFAULT '',
  pieces      integer NOT NULL,
  result      text NOT NULL CHECK (result IN ('win', 'loss', 'done')),   -- done = concluído em dupla (cooperativo)
  completed   boolean NOT NULL DEFAULT false,               -- o jogador montou o quebra-cabeça inteiro
  custom      boolean NOT NULL DEFAULT false,
  duration_ms bigint,
  opponent    text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS matches_user_idx ON matches(user_id, created_at DESC);
