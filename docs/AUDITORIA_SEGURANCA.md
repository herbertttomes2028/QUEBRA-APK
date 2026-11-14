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
7. **Sala cooperativa:** só 2 jogadores; nomes neutros; **nenhum evento de socket contém apelido, ID, nível, gemas, pet ou roupas**; quem saiu não recebe mais nada; bloqueio vale.
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
| R3 | **Limites de tentativa ficam na memória** do processo: reiniciar o Render zera; com mais de uma instância cada uma conta sozinha | hoje há 1 instância. Futuro: guardar contadores no banco/Redis se escalar |
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
