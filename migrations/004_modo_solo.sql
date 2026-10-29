-- 004: modo Solo. O histórico (matches.mode) passa a aceitar 'solo'.
-- IDEMPOTENTE: no banco de produção a restrição já foi alterada à mão em 28/10/2026 (fora do repositório);
-- esta migração alinha o repositório ao banco. Onde a restrição já aceita 'solo', ela é recriada igual (sem efeito).
-- Remove QUALQUER restrição de verificação sobre a coluna mode (seja qual for o nome) e recria com o nome padrão.
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'matches'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%mode%'
  LOOP
    EXECUTE format('ALTER TABLE matches DROP CONSTRAINT %I', c.conname);
  END LOOP;
  ALTER TABLE matches ADD CONSTRAINT matches_mode_check CHECK (mode IN ('coop', 'comum', 'quebra', 'solo'));
END $$;
