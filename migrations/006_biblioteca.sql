-- 006: Biblioteca de imagens: progresso único e desbloqueios permanentes.
-- Não modifica 001–005 e não muda os créditos de gemas.
CREATE TABLE IF NOT EXISTS library_clears (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  image_id text NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, image_id)
);
CREATE TABLE IF NOT EXISTS library_unlocks (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id text NOT NULL CHECK (category_id IN ('cultura', 'fantasia')),
  gems_spent integer NOT NULL CHECK (gems_spent > 0),
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, category_id)
);
CREATE INDEX IF NOT EXISTS library_unlocks_user ON library_unlocks (user_id);
