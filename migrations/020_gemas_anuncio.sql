-- 020: o registro de gemas passa a aceitar o tipo 'ad' (anúncio recompensado assistido até o fim; ver ads.js).
-- Migração aditiva: nenhum dado é apagado nem alterado. Os tipos antigos continuam valendo.
-- Remove QUALQUER restrição de verificação sobre a coluna kind de gem_events (seja qual for o nome) e recria com o nome padrão.
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'gem_events'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%kind%'
  LOOP
    EXECUTE format('ALTER TABLE gem_events DROP CONSTRAINT %I', c.conname);
  END LOOP;
  ALTER TABLE gem_events ADD CONSTRAINT gem_events_kind_check CHECK (kind IN ('match', 'level', 'ad'));
END $$;
-- consulta do limite diário de anúncios (só as linhas 'ad' de um jogador)
CREATE INDEX IF NOT EXISTS gem_events_user_ad ON gem_events (user_id, created_at DESC) WHERE kind = 'ad';
