-- Perfil gerado pelo próprio jogo: entra-se com o ID do perfil + um código-chave, SEM e-mail e SEM senha.
-- Só acrescenta/relaxa regras: nenhuma linha existente é alterada ou apagada.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_tem_login;
ALTER TABLE users ADD COLUMN IF NOT EXISTS secret_hash text;                                  -- scrypt do código-chave (nunca o código em si)
ALTER TABLE users ADD COLUMN IF NOT EXISTS secret_rotated_at timestamptz;                      -- quando o código-chave foi gerado pela última vez
ALTER TABLE users ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'legado';                -- 'gerado' (perfil do jogo) | 'legado' (conta antiga com e-mail)
ALTER TABLE users ADD CONSTRAINT users_tem_login CHECK (email IS NOT NULL OR google_sub IS NOT NULL OR secret_hash IS NOT NULL);
