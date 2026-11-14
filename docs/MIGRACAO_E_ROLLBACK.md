# Migração e rollback — etapa "perfil gerado"

Data: 14/11/2026 · Migração nova: `migrations/018_perfil_gerado.sql` · As migrações `001`–`017` **não foram alteradas** (hash travado em `tests/migrations.sha256.json`; a `018` foi acrescentada à lista).

## 1. O que a migração 018 faz

```sql
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_tem_login;
ALTER TABLE users ADD COLUMN IF NOT EXISTS secret_hash text;          -- scrypt do código-chave
ALTER TABLE users ADD COLUMN IF NOT EXISTS secret_rotated_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'legado';   -- 'gerado' | 'legado'
ALTER TABLE users ADD CONSTRAINT users_tem_login CHECK (email IS NOT NULL OR google_sub IS NOT NULL OR secret_hash IS NOT NULL);
```

- **Não apaga nem altera nenhuma linha.** Só relaxa uma regra (antes: e-mail **ou** Google; agora: e-mail **ou** Google **ou** código-chave) e acrescenta 3 colunas.
- Todo perfil que já existe ganha `kind = 'legado'` automaticamente.
- Roda **sozinha** quando o servidor liga (registra `018_perfil_gerado.sql` na tabela `schema_migrations`). Pode rodar de novo sem erro (a regra é removida antes de ser recriada).
- Testada localmente em Postgres 16 vazio e sobre o esquema completo `001`–`017` (suíte `gemas-postgres`).

## 2. O que acontece com quem já tinha conta (legado)

- **Não há migração de progresso para o perfil gerado.** Contas criadas com e-mail ou Google continuam no banco, **não conseguem mais entrar** (as rotas de e-mail/Google foram removidas) e mantêm os dados (incluindo o e-mail) até serem apagadas.
- A orientação jurídico-técnica pede que a migração de contas legadas preserve o progresso e ofereça restauração/rollback. **Isto não foi implementado**, porque o proprietário informou que as contas antigas eram de teste. **Se houver jogadores reais com progresso, não rode o script de apagar**; peça uma migração dedicada (por exemplo, um código de transferência de progresso).
- Para **listar** (não apaga nada): 
  ```bash
  DATABASE_URL="(a do Neon)" node scripts/apaga-contas-antigas.js
  ```
  Para **apagar** (irreversível, em cascata; só os `kind='legado'`; nunca toca perfis gerados): acrescente `--apagar --confirmo`. **Faça antes um backup/branch no Neon.**

## 3. Passo a passo seguro (resumo; o fluxo completo está na resposta do chat)

1. Neon: crie um **branch/backup** do banco antes do deploy (o Neon permite "branch" instantâneo; confira no painel).
2. GitHub: suba os arquivos numa **ramificação nova** (nunca na `main`), abra o Pull request, confira se os testes do CI passam e faça o **Merge**.
3. Render: **Manual Deploy** da `main`. Olhe os **Logs**: deve aparecer a migração `018` aplicada.
4. Confira no Neon (SQL Editor, só leitura):
   ```sql
   select name from schema_migrations order by name desc limit 3;     -- deve listar 018_perfil_gerado.sql
   select kind, count(*) from users group by kind;                    -- legado = contas antigas; gerado = perfis novos
   ```
5. Abra `/diagnostico?token=SEU_TOKEN` e veja `contas.ativas: true`.
6. Teste no celular (roteiro em `CONTAS.md`, "Passo 6").
7. Só depois, decida sobre os perfis legados (seção 2).

## 4. Rollback

### 4.1 Voltar só o código (o mais comum)
No GitHub, no Pull request mesclado: **Revert** → novo Pull request → **Merge** → Render **Manual Deploy**. O banco **não precisa** voltar:
- o código antigo ignora as colunas novas;
- contas **antigas** (com e-mail/Google) voltam a funcionar (a nova regra aceita e-mail ou Google);
- **perfis gerados** continuam no banco, mas o código antigo **não sabe entrar com código-chave**: esses jogadores ficam sem acesso até o código novo voltar (o progresso não é perdido).

### 4.2 Voltar também o banco (só se for indispensável)
A `018` é "aditiva", então normalmente **não se desfaz**. Se for mesmo preciso, **primeiro** restaure o branch/backup do Neon feito no passo 1 (perde o que foi criado depois). A alternativa manual abaixo **apaga perfis gerados** e só deve ser usada por quem entende o impacto:
```sql
-- IRREVERSÍVEL para os perfis gerados: eles não têm e-mail nem Google e violariam a regra antiga
DELETE FROM users WHERE kind = 'gerado';
ALTER TABLE users DROP CONSTRAINT users_tem_login;
ALTER TABLE users ADD CONSTRAINT users_tem_login CHECK (email IS NOT NULL OR google_sub IS NOT NULL);
-- (as colunas novas podem ficar; não atrapalham)
```
Isto **não foi testado** em banco de produção. Em hipótese alguma edite `018_perfil_gerado.sql` depois de aplicada: crie uma migração nova.

### 4.3 Botão de emergência (sem mexer no código)
No Render, apague a variável `DATABASE_URL` e reinicie: o jogo continua funcionando **como visitante** (sem perfil, loja, histórico), sem tocar no banco. Para voltar, recoloque a variável.

## 5. Limpeza futura (não feita agora)
Depois de decidir sobre os legados: migração nova para remover `email`, `google_sub`, `password_hash`, as tabelas `friendships`, `invites`, `email_codes` e o valor `amigos` do contexto de denúncia. Isso é irreversível: só com backup e com aprovação.
