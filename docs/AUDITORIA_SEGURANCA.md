# Auditoria de segurança — etapa "perfil gerado"

Data: 14/11/2026 · Código auditado: branch `perfil-gerado` (parte da `main` `a77fd15`) · Responsável pela execução: Claude (assistente de código), a pedido do proprietário.

> **Leia primeiro.** Esta é uma auditoria **automatizada e de revisão de código feita pelo próprio autor das mudanças**. Ela **não é** um teste de intrusão independente, **não** certifica o jogo como "100% seguro" e **não** é parecer jurídico. Antes de divulgar amplamente (Play Store, escolas, crianças/adolescentes), **recomenda-se uma revisão humana independente de segurança e uma revisão jurídica** (ver seção 9). Itens que não foram executados estão marcados **NÃO TESTADO**.

## 1. Escopo e regras

- **Dentro do escopo:** o código deste repositório rodando **localmente** (servidor real `server.js` + PostgreSQL local temporário + Socket.IO), em máquina controlada por nós.
- **Fora do escopo / proibido:** qualquer teste dinâmico contra o Render, o Neon, a Play Store ou a internet. O teste dinâmico se recusa a rodar se `DATABASE_URL` não for local. Nenhum ataque foi feito ao site publicado.
- **Referências usadas como lista de conferência:** OWASP ASVS (capítulos de autenticação, sessão, controle de acesso, validação, erros/logs, dados, API, configuração), OWASP API Security Top 10 (2023), cheat sheets de WebSocket/Socket.IO. Não foi feita uma certificação formal em nenhum nível do ASVS.

## 2. Métodos executados (resultados reais)

| # | Método | Resultado |
| --- | --- | --- |
| 1 | Revisão de código de `accounts.js`, `server.js`, `challenge.js`, `security.js`, `db.js`, `names.js`, `public/conta.js`, `public/excluir-conta.js` | feita; achado F1 (seção 3) |
| 2 | **Teste de segurança dinâmico local** `tests/seguranca-perfil.test.js` (servidor real + Postgres temporário; HTTP e Socket.IO) | **12 grupos de verificação, todos passando** (13 itens no relatório do Node); repetido 8 vezes seguidas e em Node 22 e Node 18 |
| 3 | **Mutações** (7 alterações propositais no código para conferir que o teste falha quando a proteção é retirada) | as 7 foram detectadas |
| 4 | Suíte completa do projeto com Postgres | **502 de 502** passando (Node 22; Node 18 em 3 execuções seguidas também 502/502) |
| 5 | Suíte completa **sem banco** | 477 passam, 13 pulados (os que exigem Postgres), 0 falhas |
| 6 | Fluxo no navegador (Chromium/Playwright, celular 390×844, **CSP em modo `enforce`**): criar perfil, recusa sem as caixas, copiar código, "anotei", apelido sorteado, código novo, sair, entrar (código antigo recusado; novo aceito em minúsculas e sem traços), apagar (código errado recusado; certo apaga), perfil apagado não entra | **as 23 verificações passaram (e 3 linhas só informativas, como o apelido sorteado); 0 violações de CSP**; avisos no console: 3 respostas 401 esperadas (códigos errados de propósito) e um aviso antigo de `Permissions-Policy` (`bluetooth` não reconhecido pelo Chromium) |
| 7 | `npm audit --omit=dev` | **0 vulnerabilidades** |
| 8 | gitleaks 8.x (árvore e histórico de 234 commits) | 2 achados, **ambos falsos positivos** (o alfabeto do código-chave `ABCDEFGHJKMNP…`); marcados com `gitleaks:allow`; árvore: **sem achados**. O histórico dos 2 commits antigos continua apontando o falso positivo até a branch ser mesclada |
| 9 | ESLint (`no-undef`) nos arquivos de servidor e de cliente | servidor: 0 erros (10 avisos de variável sem uso, os mesmos da `main`); cliente: os mesmos 17 `no-undef` da `main` (globais `QC`/`QCCab` definidas em outro script), nenhum novo |
| 10 | Testes de fonte (ex.: `sem-segredos`, `seguranca-repositorio`, `contratos`, `idade-16`, `play-store`) | passando |

### 2.1 O que o teste dinâmico (`tests/seguranca-perfil.test.js`) cobre

1. **Criação:** sem as duas confirmações (`consent` e `age16`) é recusada e nada é gravado; o código-chave só existe na resposta; no banco fica `scrypt$…`; ID e código no formato certo.
2. **Login uniforme:** ID inexistente e código errado dão a **mesma resposta**; entradas estranhas (listas, objetos `{$ne: 1}`, nulos, números, textos de 5.000 caracteres, texto de injeção SQL, JSON inválido) nunca derrubam o servidor nem dão 200/500. Tempo medido (mediana): ID existente + código errado **39,0 ms**, ID inexistente **41,9 ms** (diferença dentro do ruído; **não é prova** de tempo constante).
3. **Sessões:** sair, sair de todos e código novo matam tokens e sockets antigos; o aparelho atual continua.
4. **Rotas privadas:** sem token, token falso ou malformado → sempre 401.
5. **IDOR/BOLA:** com o token de A, nada de B é lido nem alterado, mesmo enviando o ID/código de B (perfil, apelido, importação, loja, conquistas, histórico, biblioteca, partida salva, bloqueios, denúncias e exclusão).
6. **Adulteração de gemas/XP:** campos forjados (`gems`, `xp`, `price`, `userId`…) são ignorados; **10 compras simultâneas** da mesma bandeja (preço 250, saldo 400): **1** aprovada, saldo final **150** (sem gasto em dobro).
7. **Sala cooperativa:** só 2 jogadores; nomes neutros; **nenhum evento de socket contém apelido, ID, gemas, pet ou roupas**; quem saiu não recebe mais nada; bloqueio vale. **Correção de 14/11/2026:** o nível **circulava** nos eventos (o teste não conferia); desde a rodada `privacidade-sala` ele é sempre 0, e o grupo **7b** confere isso e a lista de bloqueados (ver §10).
8. **Sala Desafio:** terceira pessoa recusada; nomes neutros.
9. **Força bruta:** trava por ID (8 erros) e por endereço (20 erros); um perfil travado não afeta os outros; **criação limitada por endereço** (de 9 tentativas em sequência: 6 criadas, 3 barradas). 9b: palpites de **código de sala** em sequência são travados (travou no 6º palpite) e a sala verdadeira continua protegida.
10. **Apagar:** código errado = mesmo erro de ID inexistente; código certo apaga tudo em cascata e derruba sessão e socket.
11. **Superfície pública e logs:** sem rotas/textos de Google, e-mail, amigos, convites; cabeçalhos de segurança presentes; 404 sem pilha de erro; **logs sem token, hash, código-chave nem e-mail**; sem `UnhandledPromiseRejection`/`TypeError`/`ReferenceError`.

## 3. Vulnerabilidades encontradas e corrigidas

| ID | Gravidade (estimativa nossa) | Descrição | Correção | Prova |
| --- | --- | --- | --- | --- |
| **F1** | Média | **Confusão de tipo no login por código-chave.** `userByKey` aceitava lista no lugar de texto (`id: ["K7QM","4TRD"]`, `secret: ["ABCDE", …]`): o normalizador juntava os pedaços, então uma lista "virava" um ID/código válido. Não dava acesso sem saber o código, mas contornava a validação de formato e a contagem de erros por ID. | `userByKey` agora exige `typeof === 'string'` para os dois campos; qualquer outra coisa conta como falha por endereço e responde igual a "código errado". | teste dinâmico grupo 2 e mutação: ao retirar a checagem de tipo, o grupo 2 falha (`not ok`: 11 passam, 2 falham); com a checagem, 13 passam, 0 falham (reconferido em 14/11/2026) |

Não foram encontradas, nos testes executados, falhas de IDOR/BOLA, gasto duplo, vazamento de dado privado em evento de sala ou segredo em log. **Isso não prova que não existam.**

Problemas **de teste** (não do produto) corrigidos no caminho: expressão regular do apelido (nomes compostos como "Tartaruga-marinha"), contagem de compras simultâneas, ordem dos testes de força bruta (travava o endereço compartilhado), e uma exceção não tratada do `pg` ao apagar o banco temporário no Node 18 (agora o teste ouve `error` das conexões).

## 4. Lista de conferência (resumo honesto)

Legenda: **TD** = verificado pelo teste dinâmico local · **RC** = verificado só por revisão de código · **NT** = NÃO TESTADO · **N/A** = não se aplica.

### OWASP ASVS (seleção)
| Tema | Item | Estado |
| --- | --- | --- |
| V2 Autenticação | segredo de alta entropia (≈ 99 bits), guardado só como hash com sal | TD |
| | resposta uniforme a falha; limites por ID e por endereço | TD |
| | recuperação sem e-mail; código novo revoga sessões | TD |
| | autenticação multifator / passkeys | **NT / não implementado** |
| V3 Sessão | token aleatório; só hash no banco; expira; revogável; derruba sockets | TD |
| | rotação do token a cada uso | não implementado (token fixo por 60 dias) |
| V4 Controle de acesso | toda rota filtra por `req.user.id`; sem rota "por ID de outro" | TD (5) + RC |
| V5 Validação | tipos, tamanhos, JSON inválido, listas/objetos no lugar de texto | TD (2) |
| | SQL parametrizado; nenhum texto de jogador dentro de comando SQL | RC |
| V7 Erros e logs | sem pilha nas respostas; logs sem segredos | TD (11) |
| V8 Dados | só dados necessários; exclusão em cascata; sem IP no banco | TD (10) + RC |
| V13 API | limites de taxa; métodos e corpos validados | TD parcial |
| V14 Configuração | cabeçalhos; CSP; segredos fora do repositório | TD (11), CSP `enforce` em navegador de teste |

### OWASP API Security Top 10 (2023)
| Risco | Estado |
| --- | --- |
| API1 BOLA | TD (5) |
| API2 Autenticação quebrada | TD (2, 3, 9) |
| API3 Exposição de propriedades (BOPLA) | TD (5, 6, 7): respostas públicas não trazem e-mail/XP bruto; entradas extras são ignoradas |
| API4 Consumo de recursos | TD parcial (9); limites em memória (ver R3); teste de carga **NT** |
| API5 Autorização por função | RC (não há papéis; só o próprio titular) |
| API6 Fluxos de negócio sensíveis (gemas/compras) | TD (6) |
| API7 SSRF | RC: o servidor só chama o Brevo (URL fixa); nenhuma URL vem do jogador |
| API8 Configuração incorreta | TD (11); CSP em `report` por padrão (ver R4) |
| API9 Inventário de rotas | RC: inventário em `docs/SEGURANCA_INVENTARIO.md`; rotas removidas conferidas pelos testes |
| API10 Consumo inseguro de APIs | RC: resposta do Brevo só é lida para registrar erro |

### WebSocket / Socket.IO
| Item | Estado |
| --- | --- |
| Autenticação do socket por token (`acc:auth`); logout/revogação derrubam o socket | TD (3, 10) |
| Terceira pessoa em sala é recusada; quem saiu não recebe mais eventos | TD (7, 8) |
| Nenhum dado privado em eventos de sala | TD (7, 8) |
| Limites de taxa e de tamanho de mensagem | RC + testes antigos de `security-resilience` |
| Origem (`Origin`) dos sockets e associação à sessão | RC (`resource-guard.js`, testes antigos) |
| Fuzzing de eventos de socket com cargas malformadas em larga escala | **NT** |

## 5. Pontos do pedido que NÃO foram atendidos ou ficaram parciais

| Pedido | Estado |
| --- | --- |
| Passkeys/WebAuthn | **não implementado**: depende de suporte real no WebView/TWA, **NT** em Android |
| Confirmar novo aparelho pelo aparelho antigo | não implementado |
| Sala com aprovação do anfitrião / QR Code | não implementado (entrada por código da sala; ver `docs/CONTROLES_LGPD_ECA.md`) |
| Migrar perfis legados preservando o progresso | **não implementado**: perfis antigos (e-mail/Google) não conseguem mais entrar; há script para listar/apagar. Decisão sobre migração fica com o proprietário (ver `docs/MIGRACAO_E_ROLLBACK.md`) |
| Anúncios | não existem (permanecem desativados) |

## 6. Riscos que continuam (residuais)

| ID | Risco | Por quê / como reduzir |
| --- | --- | --- |
| R1 | **Quem perde o código-chave perde o perfil** | sem e-mail não há recuperação; decisão de privacidade. Mitigação: aviso e caixa "anotei" na criação. Futuro: passkeys ou confirmação por aparelho antigo |
| R2 | **Bloqueio de login por terceiros (negação de serviço dirigida):** 8 erros por ID em 15 min trancam o login daquele ID, e o ID não é segredo | compromisso aceito (protege contra adivinhação); o titular já logado não é afetado. Futuro: contagem por (ID, endereço) ou desafio |
| R3 | **Limites de tentativa ficam na memória** do processo: reiniciar o Render zera; com mais de uma instância cada uma conta sozinha | hoje há 1 instância. Desde 15/11/2026 os contadores ficam em grupos separados (um grupo cheio não barra quem chega: SEC-02). Futuro: guardar contadores no banco/Redis se escalar |
| R4 | **CSP em `report` por padrão** e **token de sessão no `localStorage`**: um XSS futuro roubaria sessões | hoje não há script embutido (teste proíbe), 0 violações em `enforce` e a CSP está em `enforce` no Render (confirmado pelo proprietário). Camadas extras: nenhum `innerHTML` com dados (teste-trava) e Trusted Types em **somente relatório** (`SEGURANCA.md` 6.1). O token no `localStorage` continua: cookie `HttpOnly` é rodada própria (CSRF, Socket.IO, TWA) |
| R5 | **Pedido de exclusão por e-mail com só o ID**: o ID é público; alguém poderia pedir a exclusão do perfil de outra pessoa | definir confirmação antes de atender (ver `docs/RESPOSTA_INCIDENTES.md`) |
| R6 | **Código da sala compartilhável:** quem recebe o código entra (até 2 pessoas). Não prova relação pessoal | descrito assim na política; limite de tentativas e de 2 jogadores |
| R7 | **ID persistente é pseudônimo, não anônimo** (LGPD art. 12) | tratar como dado pessoal potencial (ver `docs/CONTROLES_LGPD_ECA.md`) |
| R8 | **Colunas e tabelas antigas** (e-mail, Google, amigos, convites) continuam no banco, sem uso, e perfis legados ainda guardam e-mail | limpeza por migração nova, depois de decidir sobre os perfis legados |
| R9 | **Registros do provedor** (IP em logs do Render/Neon) fora do nosso controle | citado na política; prazo/retenção conforme o provedor |
| R10 | **Dependências**: `npm audit` limpo hoje, mas muda com o tempo | `seguranca-dependencias.yml` no CI |
| R11 | **Android real** não testado (WebView, teclado, copiar/colar, gerenciador de senhas) | o proprietário precisa testar |
| R12 | **Brevo/Neon/Render reais** não testados com esta versão (só simulações locais) | testar a denúncia por e-mail depois do deploy |
| R13 | **Tempo de resposta do login** parecido, mas não provado constante | `FAKE_HASH` equaliza o custo do scrypt; sem medição estatística formal |

## 7. NÃO TESTADO (lista explícita)

- Qualquer teste contra o ambiente publicado (Render/Neon): proibido por regra.
- Android real (APK/AAB/TWA): abertura, voltar, teclado, copiar o código-chave, preenchimento automático.
- Teste de carga/estresse e de falha de rede/Neon dormindo.
- Fuzzing em larga escala de Socket.IO e de HTTP; ferramentas de varredura web (ZAP, Burp, Nuclei) e varredura de dependências além do `npm audit`.
- Análise estática profunda (Semgrep/CodeQL) — só ESLint `no-undef` e revisão manual.
- Cópias de segurança e restauração do Neon.
- CSP em `enforce` em dispositivo real; service worker em atualização real de versão.
- Brevo real (aviso de denúncia).
- Passkeys/WebAuthn (não existem).
- Revisão independente de segurança e revisão jurídica.

## 8. Como reproduzir

```bash
# banco local temporário (nunca Neon/Render)
export PGPASSWORD=qc DATABASE_URL=postgresql://qc:qc@127.0.0.1:5432/qc_test GEMAS_TEST_DB=1 CI=true
npm ci && npm run migrate
node --test tests/seguranca-perfil.test.js   # teste dinâmico (cria e apaga um banco qc_seg_xxxx)
npm test                                       # suíte completa (502 testes)
env -u DATABASE_URL -u GEMAS_TEST_DB npm test  # sem banco (477 passam, 13 pulados)
npm audit --omit=dev
```

## 9. Recomendações (ordem sugerida)

1. **Obrigações legais vs recomendações técnicas:** ver `docs/CONTROLES_LGPD_ECA.md`; nada aqui substitui advogado.
2. Testar no celular (Android real) e só então ligar `CSP_MODE=enforce`.
3. Contratar/consultar **revisão independente de segurança** (teste de intrusão com autorização escrita do proprietário) e **revisão jurídica** antes de divulgar para o público.
4. Decidir o destino dos perfis legados (apagar com `scripts/apaga-contas-antigas.js` ou migrar) e então limpar colunas/tabelas antigas por migração nova.
5. Considerar passkeys/confirmação por aparelho antigo como evolução, depois de testar o suporte no WebView.

## 10. Auditoria de 14/11/2026 (somente leitura) e rodadas de correção (14 e 15/11/2026)

Auditoria feita por um assistente de IA, só com leitura do código da `main` `05a2146`, testes e provas em servidor e PostgreSQL **locais** (nenhum serviço publicado foi testado). **Não é** teste de intrusão independente, certificação, selo OWASP nem parecer jurídico: continua recomendada uma revisão humana independente de segurança e uma revisão jurídica.

| ID | Achado (confirmado com prova local) | Situação |
| --- | --- | --- |
| SEC-01 | Bloquear o parceiro pela sala fazia `GET /blocks` devolver o **ID público, o apelido e o nível** dele (a tela mostrava apelido e nível); com o ID, um terceiro trancava o login da pessoa (R2) | Corrigido: `privacidade-sala` (PR #82). Lista neutra ("Jogador bloqueado" + data) e referência opaca |
| SEC-05 | O **nível** circulava nos eventos da sala, contra a política | Corrigido: PR #82 (`roomLevel()` sempre 0) |
| — | Arrasto descartado com a conexão ocupada; peça do amigo "pulava" ao encaixar (defeito relatado pelo proprietário) | Corrigido: `arrasto-sem-perda` (PR #83) |
| SEC-02 | Mapa único de limites com teto de 6000 chaves: cheio, recusava **todos** os clientes novos (login correto e criação de perfil) por até ~70 min | Corrigido: `limites-disponibilidade` (PR #84). Grupos por tipo, janela por chave |
| SEC-03 | Limite de scrypt simultâneo só reconhecia as rotas do login antigo | Corrigido: PR #84 (`HEAVY_AUTH_RE` com as rotas atuais) |
| SEC-04 | No cooperativo, quem tinha o código tomava a vaga de quem caiu no meio da partida | Corrigido: `vaga-reservada` (PR #85). Quem cai mantém a vaga; quem sai pelo botão Sair fecha a sala |
| SEC-06 | Denúncia com motivo inválido revelava se um ID existe | Corrigido: `endurecimento` (motivo conferido antes do ID). `POST /blocks` continua avisando "ID não encontrado" (decisão: evita a pessoa achar que bloqueou alguém; exige login e tem limite de 30/h) |
| SEC-07 | Lacunas de teste: o teste de acesso a dados de outro perfil passava mesmo sem o filtro de dono; o teste de HTML injetado não pegava `innerHTML +=`, colchetes, `srcdoc`, `javascript:` | Corrigido: `endurecimento` (B com dados reais; mutação do filtro agora reprova; novos padrões) |
| SEC-08 | Chat e avisos ficavam **ligados** quando a variável não existia | Corrigido: `endurecimento` (só ligam com `true`; no Render as variáveis já existem) |
| SEC-09 | Sessões vencidas nunca apagadas e sem teto por perfil | Corrigido: `endurecimento` (máx. **5 aparelhos**, decisão do proprietário; limpeza a cada hora) |
| H-02 | Abrir a política de privacidade no app gerava aviso do Trusted Types | Confirmado no Chrome 153 sem tela (1 aviso por abertura) e corrigido: `endurecimento` (0 avisos) |
| DOC-01 | Documentação desatualizada (SHA, contagens, Google, CSP, scrypt) e e-mail de contato com "unversidade" | Corrigido: `endurecimento` (endereço confirmado: `herbert.uva.universidade@gmail.com`) |

**Continuam como hipótese ou decisão de produto (não corrigidos):**

- **H-01:** um cliente automatizado pode montar qualquer quebra-cabeça em milissegundos (o servidor precisa mandar `col`/`row` para o celular recortar a imagem): vence sempre a Sala Desafio e acumula gemas no Solo (o tempo mínimo é o único freio). Não há dinheiro envolvido.
- **H-03:** perfis legados (e-mail/Google) com sessão ainda válida continuam jogando até a sessão vencer; para eles, apagar o perfil não pede código-chave.
- **H-04:** token de sessão no `localStorage`; o padrão do código é CSP `report`. O modo real no Render é o que o proprietário configurou (ver R4).
- **H-05:** o endereço real vem do último valor de `X-Forwarded-For` (`trust proxy = 1`): correto se o proxy do Render sempre acrescenta o IP real (não verificado).
- **H-06:** o botão "copiar" põe ID e código-chave na área de transferência do aparelho.
- **H-07:** sockets sem `Origin` são aceitos (necessário para clientes nativos; os limites continuam valendo).
- **Não testado:** Android real, Render/Neon/Brevo reais, carga, fuzzing amplo.


## 11. Auditoria final de 17/11/2026 (SEC-10 a SEC-13) e correções

Auditoria feita por um assistente de IA sobre a `main` `6adbddc`, com testes e provas **somente em servidor e PostgreSQL locais** (nenhum serviço publicado foi testado). Mesmas ressalvas do topo: **não é** teste de intrusão independente nem parecer jurídico. As correções foram autorizadas pelo proprietário e entregues como pacote (branch `seguranca-final`); deploy e publicação são feitos por ele.

### 11.1 Aproveitamento do que já existia
- **Não repetidos (continuam válidos, o código envolvido não mudou):** CSP em `enforce` no navegador (com anúncios desligados a política é idêntica), tempo de resposta do login, mutações de 14/11, Node 18.
- **Repetidos porque o código mudou depois de 14/11 (24 arquivos de código em 18 PRs):** suíte completa (inclui o teste dinâmico `seguranca-perfil`, 12 grupos), varredura de segredos, `npm audit`, ESLint.
- **Novos (eram NÃO TESTADO em §7, ou superfície nova):** fuzzing de Socket.IO, objetos "venenosos" em todos os campos de todos os eventos, fuzzing HTTP de todas as rotas, estresse de 9.000 conexões, `eslint-plugin-security` + `eslint-plugin-no-unsanitized`, revisão de SQL, anúncios, economia de gemas, fileira de 5, ímã e IP real atrás do proxy.

### 11.2 Achados
| ID | Gravidade (estimativa) | Achado | Situação |
| --- | --- | --- | --- |
| **SEC-11** | **Alta** | Um evento de socket com um objeto cujo `toString`/`valueOf` não são funções (ex.: `{"code":{"toString":1}}`) fazia `String()`/`Number()` lançarem erro dentro do ouvinte e **o processo terminava**: todas as partidas perdidas e os contadores de tentativas na memória voltavam a zero (R3). Sem login. 6 pontos: `validPieces`, `clamp`, `pieceFrom`, código do `join` (`server.js`), `pieceOf` e código do `ch:join` (`challenge.js`); 4 derrubaram o servidor no teste e 2 só eram alcançáveis segurando uma peça / com o Desafio em andamento | **Corrigido** em duas camadas independentes (11.3) |
| **SEC-10** | Média (cresce com o número de jogadores) | No Render o X-Forwarded-For chega como "IP do celular, IP do Cloudflare" e o jogo usava o último: **todos os limites por endereço contavam pelo IP do Cloudflare** (login, criação de perfil 6/h, criação de sala 12/10 min, 32 conexões); jogadores legítimos eram barrados juntos e uma pessoa poderia trancar todos os que passam pelo mesmo ponto | **Corrigido** (11.3); conferir `ip_real` no `/diagnostico` depois do deploy |
| **SEC-12** | Baixa | `constructor`, `__proto__`, `toString`… como `category` em `/shop/equip` escolhiam uma propriedade herdada e o texto chegava ao SQL (erro 500). **Não era injeção** (o texto não é controlado por quem ataca) | **Corrigido** |
| **SEC-13** | Informativa (só com anúncios ligados) | Com `ADS_MODO=teste/real`, a CSP libera `https://*.google.com` e `https://*.gstatic.com` em `script-src`, o que enfraquece a CSP como barreira contra XSS | **Não corrigido** (anúncios desligados hoje); revisar antes de ligar |
| — | Informativa | Sem `NODE_ENV=production`, um corpo malformado em `/api/csp-report` devolve a pilha do erro do Express. O Render define `NODE_ENV=production` em tempo de execução para Node.js: no jogo publicado a resposta é só "Bad Request" | Sem ação |

**Verificado e aprovado (sem achado):** segredos (gitleaks 8.21.2: 0 no histórico e 0 na árvore); dependências (`npm audit`: 0); SQL (só constantes do código interpoladas; nenhum dado do jogador); trava contra HTML injetado cobre todos os `.js` de `public/` (inclusive os novos); fuzzing HTTP (0 respostas 5xx, nenhuma resposta com segredo, nenhum arquivo interno servido: `.env`, `.git/config`, `server.js`, migrações, `node_modules`); poluição de protótipo (`Object.prototype` intacto em todos os testes; `/import` aceita a chave `__proto__` mas atribuir número a ela não tem efeito); economia (quantidades 64/88/96 não aumentaram o ganho máximo de um robô: 7,2–8,3 gemas/min em todas as quantidades, como a de 48; gemas só com tempo mínimo conferido pelo servidor e `ON CONFLICT`); lâmpada sem limite (só desconta o contador, não encaixa); anúncios (ficha única com comparação em tempo constante, valor do servidor, limite diário e intervalo, transação com trava); fileira de 5 (peça guardada não pode ser pega nem marcada, nos dois modos); ímã (`WeakMap`, temporizadores conferem se a sala ainda existe); plugins de segurança do ESLint (só falsos positivos, revisados).

### 11.3 Correções
- **SEC-11 (a) conversões seguras:** `asNum`/`asStr` (`server.js`) só aceitam número e texto; o mesmo teste de tipo em `challenge.js`. Número ou texto continuam funcionando como antes.
- **SEC-11 (b) proteção central:** `guardHandlers` em `resource-guard.js`, ligada na blindagem dos sockets (antes de qualquer `socket.on` do jogo, de `accounts.js` e de `challenge.js`). Todo ouvinte roda em `try/catch` e a promessa recusada é pega; mesmos argumentos, `this` e retorno; `guarded.listener = fn` mantém `socket.off(fn)` e o `once` funcionando (falha achada na revisão do próprio diff e corrigida: sem isso o ouvinte "once" ficava registrado para sempre). Segunda falha achada na mesma revisão e corrigida: o registro do erro fazia `String(err)` e um erro "venenoso" quebraria o próprio tratamento; agora a conversão também fica em `try/catch` (o mesmo na rede final de promessas). Registro: só o nome do evento e a mensagem, no máximo 1 linha a cada 10 s. Contador em `/diagnostico` (`eventos_invalidos_ignorados`).
- **SEC-11 (c) rede final:** `process.on('unhandledRejection')` só registra (contador `promessas_sem_tratamento`). Nenhum caminho conhecido chega lá (todas as promessas soltas nos eventos têm `.catch`). Erro síncrono fora dos eventos continua encerrando o processo de propósito.
- **SEC-10:** `security.clientIp(headers, remoto)` é a regra única de HTTP (`req.ip`, por `Object.defineProperty(app.request, 'ip', …)`) e de sockets (`ipOfSocket`). Se o último endereço é do Cloudflare (15 faixas IPv4 + 7 IPv6 oficiais, embutidas), vale o `CF-Connecting-IP` (o Cloudflare sempre o reescreve) ou, na falta, o penúltimo endereço (o que o próprio Cloudflare acrescentou); IPv6 conta pelo bloco /64; corrente estranha = endereço do Cloudflare (como antes). **Sem Cloudflare, exatamente o comportamento anterior.** `/diagnostico` (com token) mostra `ip_real` só com a forma da corrente, nunca endereços.
- **SEC-12:** `Object.prototype.hasOwnProperty.call(PET_SLOT, category)`.

### 11.4 Provas (antes → depois)
| Prova | `main` 6adbddc | Corrigida |
| --- | --- | --- |
| Objetos venenosos: 2.520 cargas (todos os campos × todos os eventos × fora/coop/Desafio) | **15 quedas** em 4 pontos | 0 (também 0 só com a camada a, e só com a camada b) |
| Fuzzing Socket.IO (cargas malformadas, poluição de protótipo, argumentos a mais/a menos) | caiu na 1ª rodada | ~16 mil eventos, 0 quedas, partida legítima jogando o tempo todo |
| Fuzzing HTTP (todas as rotas, com/sem sessão, corpos e tipos inválidos, travessia de caminho) | 0 respostas 5xx | 0 respostas 5xx |
| Estresse: 60 salas/120 jogadores + 9.000 conexões | memória estável (~10,4 MB) | memória estável (~10,5 MB), 0 recusas |
| IP real simulado: 8 celulares atrás do mesmo Cloudflare criam perfil | 6 criados, 2 barrados sem motivo | 8 criados |
| 14 celulares atrás do mesmo Cloudflare criam sala | 12 criadas, 2 barradas | 14 criadas |
| 1 celular forjando o X-Forwarded-For / girando IPv6 no mesmo /64 | (todos já barrados juntos) | continua limitado |
| Sem Cloudflare na frente | — | idêntico à `main` |
| `/shop/equip` com `constructor` etc. | 500 (erro de SQL) | 400 "invalid", sem tocar no banco |
| Suíte completa com banco | 624/624 | 631/631 (+7 de `tests/seguranca-final.test.js`, que reprovam na `main`) |

### 11.5 Riscos que continuam
- **SEC-13** (CSP larga com anúncios ligados), **H-01** (robô monta quebra-cabeças; o tempo mínimo é o único freio; ganho máximo inalterado), **R2** (8 erros por ID trancam o login daquele ID), **R3** (limites na memória: o deploy zera; a derrubada por mensagem, que também zerava, foi eliminada), **R4** (token no `localStorage`; CSP `report` por padrão no código), **R8** (colunas/tabelas e perfis legados com e-mail).
- **SEC-10, residual:** a correção se apoia na arquitetura do Render documentada pela comunidade e pela equipe dele (Cloudflare na frente), não verificada no ambiente publicado: conferir `ip_real` no `/diagnostico` (com token). Usuários atrás do mesmo NAT de operadora (CGNAT, comum em IPv4 no celular) continuam dividindo os limites. Um ataque que passe pela própria infraestrutura do Cloudflare (por exemplo, Workers) **não foi testado**; os tetos globais (criação de perfis por hora, conexões e salas no total) e o travamento por ID continuam valendo. As faixas do Cloudflare estão embutidas: se mudarem, atualizar `security.js`.
- **Não testado:** Android real; Render/Neon/Brevo reais; ZAP/Burp/Semgrep/CodeQL (foram usados os plugins de segurança do ESLint); restauração do Neon; revisão independente de segurança e revisão jurídica (continuam recomendadas antes de divulgar para escolas e menores).

## 12. Rodada `limites-ip` (17/11/2026): IP real na corrente do Render e limites que cabem uma turma

### 12.1 O que o Render mostrou
O `/diagnostico` publicado (com token; só a FORMA, sem endereços) trouxe `ip_real`: **3 endereços** no X-Forwarded-For, **o último fora do Cloudflare** e `CF-Connecting-IP` presente. A regra do SEC-10 (§11.3) só reconhecia "último = Cloudflare" e, fora disso, ficava com o último endereço: no Render ele é um salto do próprio Render, igual para todo mundo. Na prática **o SEC-10 não valia no jogo publicado** e todos os limites por endereço continuavam sendo do jogo inteiro: 6 códigos de sala errados de qualquer pessoa travavam a entrada em salas de todos por 15 min (até 24 h reincidente), 6 perfis por hora, 32 conexões, 12 salas a cada 10 min. Mesmo com o IP certo, esses números não cabem uma turma: numa escola todos saem pelo mesmo endereço (e na rede móvel, o CGNAT junta centenas de celulares).

### 12.2 Correção
| Parte | Antes | Agora |
| --- | --- | --- |
| IP real | último = Cloudflare → `CF-Connecting-IP`; senão o último | do fim para o começo: pula saltos INTERNOS (faixas privadas, CGNAT, link-local, IPv6 privado); Cloudflare no lugar que sobrou, **ou** um salto público no fim logo depois de um Cloudflare (com alguém antes dele) → `CF-Connecting-IP` (ou o endereço que o Cloudflare acrescentou); sem Cloudflare → o primeiro não interno a partir do fim. IPv6 por /64 |
| `/diagnostico` › `ip_real` | quantidade, último é Cloudflare, tem CF-Connecting-IP | + `tipos_do_primeiro_ao_ultimo`, `cf_connecting_ip_igual_a_posicao`, `regra_usada` (nunca endereços) |
| Código de sala errado | 6/15 min e 30/dia **por endereço** | **6/15 min e 30/dia por aparelho** (perfil logado ou conexão) **+ 40/15 min e 200/dia por endereço** (travas 10 min, 30 min, 2 h, 6 h) |
| Criar perfil | 6/h por endereço; 1500/h no total | 60/h e 300/dia por endereço; 1500/h no total; com 750 na última hora, 10/h por endereço |
| Conexões | 32 por endereço; 500 no total | 120 por endereço; 500 no total; acima de 375, endereço com 32 ou mais não abre outra |
| Criar sala | 12/10 min por endereço; 240 ativas | 60/10 min por endereço e 20 por aparelho; 240 ativas; acima de 180, endereço que já criou 12 na janela espera |
| API / arquivos | 360 / 1500 por minuto por endereço | 1500 / 6000 (uma abertura do jogo faz ~34 pedidos) |
| Login por ID + código-chave | 40 por 10 min e 20 erros por 15 min por endereço; 8 erros por ID | 200 e 60 por endereço; **8 erros por ID (igual)** |
| Mapas na memória | endereços: cheio (8 mil) trava os novos | aparelhos (20 mil): descarta os mais antigos; endereços: descarta só quem errou uma vez e nunca foi travado (olha os 500 mais antigos), senão trava os novos |

Ordem das checagens onde há aparelho e endereço: **o aparelho primeiro**, para quem insiste não gastar a cota da rede. Todos os números são ajustáveis por variável (CONTINUIDADE §6) e aparecem no `/diagnostico` (`seguranca.limites_por_endereco`, `seguranca.limite_de_tentativas`).

### 12.3 Provas (local; servidor descartável; PostgreSQL local; nada no Render, Neon ou Brevo)
| Prova | `main` 583294a | Esta rodada |
| --- | --- | --- |
| Corrente "celular, Cloudflare, salto interno do Render": dois celulares | os dois com o MESMO endereço (o do Render) | cada um com o seu |
| `tests/limites-ip.test.js` (14 testes) rodado contra a `main` | 14 reprovam | 14 passam |
| Simulação com banco, corrente de 3 endereços — escola: 62 perfis / 125 conexões / 65 salas | 6 criados / 32 / 12 | 60 (2 barrados) / 120 / 60 |
| ...outra escola, ao mesmo tempo: 5 perfis / 1 conexão | **5 barrados / recusada** (o limite era do jogo inteiro) | 5 criados / aceita |
| 20 alunos digitam um código errado; 1 insiste; colegas entram nas salas certas | (só 32 conectaram) | 20 sem trava; quem insiste trava no 6º; 20 de 20 entram |
| Atacante reabrindo conexões para chutar códigos; depois, a escola vizinha tenta | trava no 6º e **a escola vizinha fica travada também** | trava no 40º; a escola vizinha não é afetada |
| Forjar: `CF-Connecting-IP` sem Cloudflare (girando, 65×); IPv6 girando no /64 (65×) | todos barrados (chave única) | 60 criados e 5 barrados nos dois (a chave não muda) |
| Objetos venenosos (2.520 cargas) / fuzzing Socket.IO (24 mil eventos) | 0 quedas / 0 quedas (rodada anterior, mesmo código) | 0 / 0 |
| Fuzzing HTTP (3.868 pedidos) | 0 respostas 5xx | 0 respostas 5xx (contagem por código idêntica à `main`) |
| Estresse 60 salas + 9.000 conexões | memória estável (rodada anterior) | memória estável (~10,6 MB), 0 falhas |
| Navegador (abertura, partida Solo de 20 peças) | — | mesmos números da medição anterior, 0 erros |
| Custo de um palpite com o mapa de endereços cheio | — | ~0,03 ms |

### 12.4 Riscos que continuam
- **Forma "Cloudflare + 1 salto público":** se o Render acrescentar um salto PÚBLICO (e não interno) depois do Cloudflare, a regra confia no `CF-Connecting-IP`. Esse formato é indistinguível de alguém que conseguisse falar direto com o último proxy do Render, sem passar pelo Cloudflare (não há notícia de que seja possível). Conferir no `/diagnostico` depois do deploy: com "saltos internos" esse risco não existe.
- **Mesma rede:** dentro de uma escola, quem reabre o aplicativo de propósito ainda consegue travar a entrada em salas daquela rede por 10 min (não a do jogo inteiro); e criar 60 salas ou perfis por hora gasta a cota daquela rede.
- **Tetos gerais:** com muitos endereços (centenas), alguém ainda esgota os tetos gerais (500 conexões, 240 salas, 1500 perfis/h); a reserva só impede que um ou dois endereços façam isso.
- **Limites na memória:** o deploy zera as contagens (R3, igual).
- **Não testado:** o Render de verdade, uma turma real, Android real.

