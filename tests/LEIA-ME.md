# Testes automáticos

Rodam o **servidor de verdade** (`server.js`, sem banco, modo visitante) e dois clientes Socket.IO, mais verificações estáticas dos contratos do projeto. Não usam Chromium, celular nem PostgreSQL.

## Como rodar (no computador, com Node 18 ou superior)

    npm install
    npm test

Leva cerca de 4 segundos. Termina com `# fail 0` quando tudo está certo.

## O que cobre

| Arquivo | O que verifica |
| --- | --- |
| `xp.test.js` | Curva de níveis, XP por faixa, repetição, imagem própria, tempo mínimo, amigo, vitória e limites do dia (valores do `XP.md`) |
| `contratos.test.js` | Migrações 001–003 imutáveis (hash em `migrations.sha256.json`), as duas cópias de `tryLock` iguais, `SNAP`, nomes dos eventos de socket, `payMatch` como única entrada de XP, retorno de `createAccounts`, sessão só com hash, frases só por código, CSP, tela inicial sem nome/avatar, chaves `qc.*`, `render.yaml` sem chave duplicada e `.gitignore` |
| `coop.test.js` | Partida cooperativa real: sala de 2, encaixe (`rot === 0` e distância ≤ `SNAP`), giro em cima do lugar, exclusividade da peça, vitória, bate-papo só com frases |
| `desafio.test.js` | Sala Desafio real: lobby, contagem, tabuleiros separados, vencedor, mesma regra de encaixe, caixa do Quebrando Cabeças (3 por rodada, 4ª bloqueada, 3 automáticas), sair dá vitória ao outro |

## O que NÃO cobre

- Contas, amigos, XP gravado e histórico **com banco** (precisam de PostgreSQL; não rodam aqui).
- Telas, botão voltar do Android, PWA, service worker, áudio e vibração.
- Celular real, APK, Render, Neon, Brevo, push e login Google.
- Carga (muitas salas) e redes lentas.

## Se uma migração precisar mudar

Nunca edite a `001`, `002` ou `003`. Crie `004_...sql` e, **depois**, acrescente o hash dela em `migrations.sha256.json` (`sha256sum migrations/004_*.sql`).

## Se você mudar a regra de encaixe de propósito

Mude `tryLock` nos **dois** arquivos (`server.js` e `challenge.js`) e atualize os testes `contratos` e `coop`/`desafio` na mesma rodada.
