# Inventário de segurança — Quebra-Cabeça a Dois

Data-base: 14/11/2026 · Etapa: **perfil gerado** (branch `perfil-gerado`, parte da `main` `a77fd15`) · Autor da análise: Claude (assistente de código). **Este inventário descreve o código real do repositório, não a versão publicada**: confira o que está no ar antes de tirar conclusões. Não é parecer jurídico nem certificação de segurança.

## 1. Ativos a proteger (prioridade pedida pelo proprietário)

| Ativo | Onde fica | Quem pode ler/alterar | Principal proteção |
| --- | --- | --- | --- |
| Perfil (apelido sorteado, avatar, ID público) | `users` (Neon) | só o titular com sessão; ID é público, mas inútil sozinho | sessão por token; todas as rotas filtram por `req.user.id` |
| Código-chave | **nunca guardado**; só `users.secret_hash` (scrypt) | ninguém | exibido uma vez; hash com sal; comparação em tempo constante; `FAKE_HASH` equaliza o tempo |
| Sessões | `sessions.token_hash` (SHA-256) | servidor | token cru nunca guardado; 60 dias; revogável; derruba sockets |
| Gemas, XP | `users.gems`, `users.xp`, `gem_events`, `xp_events` | **só o servidor** (`payMatch`, compras sob trava de linha) | nenhuma rota aceita valor do cliente; compra idempotente |
| Pets, roupas, bandejas | `shop_purchases`, `shop_prefs` | titular | `UNIQUE (user_id, item_id)`; preço pago gravado; ids validados por padrão |
| Conquistas, histórico | `matches`, `puzzle_clears`, `library_*`, derivados | titular | consultas sempre por `user_id` da sessão |
| Partida salva | `saves` | titular | idem |
| Salas privadas | **memória do servidor** (não vai ao banco) | 2 jogadores com o código da sala | código de 6 caracteres + limite de tentativas; 3ª pessoa recusada; "Jogador 1/2" |
| Denúncias | `reports` | só o responsável (via Neon/e-mail) | pessoa denunciada nunca é avisada; resposta uniforme |
| Segredos de infraestrutura | variáveis do Render (`DATABASE_URL`, `BREVO_API_KEY`, `DIAG_TOKEN`) | proprietário | fora do GitHub; teste `sem-segredos` em todo PR |

## 2. Superfície de ataque

### 2.1 HTTP público (`/api/acc`, sem sessão)
`GET /status`, `POST /profile/new`, `POST /profile/login`, `POST /profile/erase` (exclusão **sem sessão**, por `EXCLUIR` + ID + código-chave; é a rota usada por `public/excluir-conta.html`). Limites: ver seção 4.

### 2.2 HTTP com sessão (`Authorization: Bearer`)
`GET /me`, `/achievements`, `/matches`, `/library`, `/shop`, `/save`, `/blocks`; `POST /profile` (só avatar), `/profile/nickname`, `/profile/new-secret`, `/delete` (exclusão com sessão: `EXCLUIR` + código-chave), `/logout`, `/logout-all`, `/blocks`, `/blocks/remove`, `/reports`, `/import`, `/underage`, `/library/unlock`, `/shop/buy|equip|prefs`, `/save/discard`.
**Removidas nesta etapa:** `register`, `login`, `verify*`, `password/*`, `google`, `friends*` (e os eventos `inv:send`, `inv:respond`).

### 2.3 Socket.IO
Cooperativo: `create join grab move drop rotate hint spot chat imgready restart rematch:*`; Desafio: `ch:*`; contas: `acc:auth acc:logout acc:blockPeer acc:reportPeer` (+ `acc:continue` no `server.js`). Chat só com frases prontas e hoje **desligado** no Render (`CHAT_ENABLED=false`); push **desligado** (`PUSH_ENABLED=false`). Servidor → cliente: nenhum evento de sala leva apelido, ID, nível, gemas, pet ou roupas (teste dinâmico 7 e 8).

### 2.4 Outros
`GET /diagnostico` (detalhe só com `DIAG_TOKEN`), `GET /health`, `POST /api/csp-report`, `/.well-known/assetlinks.json`, arquivos estáticos de `public/`.

## 3. Fronteiras de confiança

1. **Cliente (navegador/TWA) → servidor:** nada que o cliente envie é autoritativo (saldo, XP, resultado, preço, dono do item).
2. **Servidor → Neon:** só o servidor fala com o banco (TLS com certificado verificado; `DB_SSL_VERIFY=0` é ignorado).
3. **Servidor → Brevo:** apenas o aviso de denúncia (sem e-mail de jogador).
4. **Jogador ↔ jogador:** só por salas privadas; sem canal de texto livre; sem diretório de salas; sem lista de jogadores.

## 4. Controles existentes (código)

| Controle | Valor | Onde |
| --- | --- | --- |
| Alfabeto do código-chave | 31 símbolos (sem I, L, O, 0, 1), 20 símbolos ≈ 99 bits | `accounts.js` (`KEY_CHARS`, `KEY_LEN`) |
| Hash do código-chave | scrypt N=16384, sal de 16 B, saída de 64 B | `hashPassword` |
| Erros de login | 8 por ID e 20 por endereço, janela de 15 min | `noteFail`/`tooMany` (`kfail:id:`, `kfail:ip:`) |
| Criação de perfil | 6 por hora por endereço (+ 1500/h global) | `pnew:ip`, `pnew:all` |
| Login | 40 por 10 min por endereço | `plogin:` |
| Código novo | 5 por hora por perfil | `psec:` |
| Apelido | 20 por hora por perfil | `pnick:` |
| Apagar | 5 por 10 min por perfil; 20 por 10 min por endereço (apagar público) | `del:`, `perase:` |
| Denúncia | 15 por hora por jogador | `report:` |
| Compras | limite por minuto por jogador; idempotentes sob trava de linha | `shop:`, `withUserLock` |
| Sessão | 60 dias; só `sha256(token)` no banco | `SESSION_MS` |
| Cabeçalhos | HSTS, `nosniff`, `frame-ancestors 'none'`, COOP, Permissions-Policy, CSP (`report` por padrão; `enforce` por variável), Trusted Types só em relatório | `security.js` |
| Proxy | `trust proxy` = 1 (o IP vem do Render) | `server.js` |

## 5. Dados pessoais tratados (mapa para a LGPD)

| Dado | Finalidade | Observação |
| --- | --- | --- |
| Apelido sorteado, avatar | identificar o perfil para o próprio titular | não é nome civil; não aparece para outros |
| ID público (8 caracteres) | identificar o perfil no login e na exclusão | pseudônimo persistente: **continua sendo dado pessoal potencial** (LGPD art. 5º, I; 12) |
| Hash do código-chave | autenticar | não reversível |
| Progresso (gemas, XP, conquistas, histórico, loja, partida salva) | funcionamento do jogo | ligado ao ID |
| Endereço IP | limites de tentativa (memória) e logs técnicos do Render/Neon | o jogo não grava IP no banco |
| Denúncias | moderação | contêm o ID e o apelido da pessoa denunciada |
| Mês/ano de nascimento | tela de idade | **só no aparelho**, nunca enviado |

Não coletados: nome civil, e-mail, telefone, CPF, foto, localização, contatos.

## 6. Funcionalidades removidas ou desligadas (não reintroduzir)

Amigos, pedidos, convites, perfil do amigo, e-mail/senha/Google, recuperação por e-mail, chat livre (e, por ora, chat de frases e push), upload de imagens. O teste `tests/seguranca-perfil.test.js` (grupo 11) e `tests/contratos.test.js` falham se rotas, eventos ou textos dessas funções reaparecerem.

## 7. O que ainda não existe (e foi pedido na orientação jurídico-técnica)

- **Passkeys/WebAuthn**: não implementado (dependem do suporte real do WebView/TWA, que não foi testado). O mecanismo atual é o código-chave de alta entropia.
- **Confirmação de novo aparelho pelo aparelho antigo**: não implementado.
- **Aprovação do anfitrião e QR Code** nas salas: não implementados (a entrada é por código da sala).
- Registro de auditoria (`gem_ledger` completo, `room_events`): existe `gem_events`/`xp_events`; não há trilha de eventos de sala.
