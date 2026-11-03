-- 007: o jogo deixou de aceitar imagens enviadas pelos jogadores (LGPD, art. 14: público infantil).
-- APAGA as fotos já guardadas junto das partidas salvas e as partidas salvas que dependiam delas (image_id = 'custom').
-- Não remove a coluna (as migrações antigas são imutáveis); ela passa a ficar sempre NULL. Idempotente: pode rodar de novo sem efeito.
UPDATE saves SET custom_image = NULL WHERE custom_image IS NOT NULL;
DELETE FROM saves WHERE image_id = 'custom';
