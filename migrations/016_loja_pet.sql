-- 016: a loja ganha as categorias SKINS e ROUPAS do pet (mascote). A posse continua em shop_purchases (item_id livre, já aceita ids novos) e o catálogo e os preços
-- continuam em shop.js; aqui só guardamos o que a conta EQUIPOU (um id de skin e um de roupa; NULL = o pet de fábrica). Excluir a conta apaga tudo (ON DELETE CASCADE).
ALTER TABLE shop_prefs ADD COLUMN IF NOT EXISTS pet_skin text CHECK (pet_skin IS NULL OR pet_skin ~ '^[a-z][a-z0-9-]{1,39}$');
ALTER TABLE shop_prefs ADD COLUMN IF NOT EXISTS pet_outfit text CHECK (pet_outfit IS NULL OR pet_outfit ~ '^[a-z][a-z0-9-]{1,39}$');
