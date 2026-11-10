-- 013: o desbloqueio por gemas passa a aceitar QUALQUER categoria do catálogo (a 006 só aceitava 'cultura' e 'fantasia',
-- o que faria a compra de uma categoria paga nova falhar com erro no servidor). Agora a integridade vem do próprio catálogo:
-- só se desbloqueia uma categoria que existe em library_categories. Quem decide se ela é paga continua sendo library.js (unlock = 'gems').
-- Nada existente é apagado: as linhas atuais ('cultura' e 'fantasia') existem no catálogo (008), então a chave estrangeira é válida.
ALTER TABLE library_unlocks DROP CONSTRAINT IF EXISTS library_unlocks_category_id_check;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'library_unlocks_category_fk' AND conrelid = 'library_unlocks'::regclass) THEN
    ALTER TABLE library_unlocks ADD CONSTRAINT library_unlocks_category_fk FOREIGN KEY (category_id) REFERENCES library_categories(id);
  END IF;
END $$;
