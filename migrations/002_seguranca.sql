-- Segurança: confirmação de e-mail, códigos temporários (confirmar e-mail / trocar senha) e jogadores bloqueados.

ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;
-- contas criadas ANTES da confirmação por e-mail existir: nunca são apagadas por um novo cadastro com o mesmo e-mail
ALTER TABLE users ADD COLUMN IF NOT EXISTS legacy boolean NOT NULL DEFAULT false;
UPDATE users SET legacy = true;
-- quem entrou pelo Google já teve o e-mail confirmado pelo próprio Google
UPDATE users SET email_verified = true, email_verified_at = now() WHERE google_sub IS NOT NULL;

CREATE TABLE IF NOT EXISTS email_codes (
  id         bigserial PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose    text NOT NULL CHECK (purpose IN ('verify', 'reset')),
  code_hash  text NOT NULL,                                  -- só o hash do código de 6 números
  attempts   integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS email_codes_user_idx ON email_codes(user_id, purpose);

CREATE TABLE IF NOT EXISTS blocks (
  blocker    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker, blocked),
  CHECK (blocker <> blocked)
);
CREATE INDEX IF NOT EXISTS blocks_blocked_idx ON blocks(blocked);
