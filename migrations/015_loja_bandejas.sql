-- 015: loja do jogo (primeira categoria: BANDEJAS). Pago SOMENTE com as gemas virtuais que já existem (users.gems); nada de dinheiro real.
-- O catálogo (nomes, preços) vive em shop.js; o banco guarda o que cada jogador comprou, o que equipou e as cores escolhidas.
-- Excluir a conta apaga tudo isto (ON DELETE CASCADE), como todo o resto.
CREATE TABLE IF NOT EXISTS shop_purchases (
  id         bigserial PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category   text NOT NULL DEFAULT 'bandejas' CHECK (category ~ '^[a-z][a-z0-9-]{1,39}$'),
  item_id    text NOT NULL CHECK (item_id ~ '^[a-z][a-z0-9-]{1,39}$'),
  gems_spent integer NOT NULL CHECK (gems_spent > 0),            -- o preço PAGO (o histórico não muda se o preço mudar depois)
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, item_id)                                       -- impede compra duplicada, mesmo com dois toques ao mesmo tempo
);
CREATE INDEX IF NOT EXISTS shop_purchases_user_time ON shop_purchases (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS shop_prefs (
  user_id    uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  equipped   text NOT NULL DEFAULT 'classica' CHECK (equipped ~ '^[a-z][a-z0-9-]{1,39}$'),
  colors     jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(colors) = 'object'),   -- { "nuvem": "#aabbcc", ... } uma cor por modelo
  anim       boolean,                                                                         -- animações das bandejas (null = ainda não escolheu)
  updated_at timestamptz NOT NULL DEFAULT now()
);
