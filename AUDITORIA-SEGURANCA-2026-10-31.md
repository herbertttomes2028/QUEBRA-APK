# Auditoria defensiva de segurança — Quebra-Cabeça a Dois

**Rodada:** 31/10/2026. **Base imutável para retorno:** commit `8928aca2862ea0646bf111e4da964cd365abff63` da `main`, PR #28 (Galeria de Coleções). **Escopo:** código do servidor, Express, Socket.IO, autenticação, sessões, banco PostgreSQL/Neon, upload, notificações, PWA, política CSP, dependências declaradas e configuração Render no repositório. **Sem acesso às configurações privadas do painel Render/Neon, nem a testes no Android físico.**

## Situação de publicação

**NÃO declarar pronto para publicação ainda.** Há correções úteis implementadas nesta rodada, mas a integração com Socket.IO/PostgreSQL real, a auditoria das dependências pelo registro npm e os controles de borda contra tráfego distribuído precisam passar nos testes externos. Não há promessa de imunidade a ataques.

## Achados de código e mitigação implementada

| ID | Gravidade anterior | Evidência verificada | Correção entregue | Risco após correção local |
|---|---|---|---|---|
| S-01 | **Alta** | `server.js` e `challenge.js`: salas sem máximo global e criação sem cota por IP; `io` sem máximo de conexões/s por IP | `resource-guard.js`: limite agregado **240 salas**, **12 novas salas/IP em 10 min**, **500 sockets totais**, **32 sockets/IP**, limite por evento (controle 90/3 s; movimentação 240/3 s) e liberação das vagas no desconectar. | Depende de validação real em Android, Socket.IO, Render; ataque distribuído ainda requer proteção na borda. |
| S-02 | **Alta, condicional a configuração errada** | Rota `/api/test-outbox` mostraria códigos de e-mail publicamente se `NODE_ENV=test` e `MAIL_PROVIDER=test` fossem definidos no Render | Rota HTTP `/api/test-outbox` removida por completo, inclusive em testes; mensagens de teste ficam somente no objeto interno do mailer. | Condição não testada em Render; verificar que a rota está inacessível externamente. |
| S-03 | **Alta** | Revogar sessão HTTP não invalidava necessariamente identidade já associada a sockets de conta e ações privilegiadas por Socket.IO | `accounts.js`: revogação de socket após logout/logout-all/troca ou recuperação de senha/exclusão, checagem no banco por token_hash para convites e bloqueio e geração de autenticação contra respostas atrasadas. | Validar cenários com 2 dispositivos e banco real. |
| S-04 | **Média** | Duas solicitações concorrentes podiam validar o mesmo código de e-mail entre SELECT e DELETE | Consumo **atômico** `DELETE ... WHERE ... RETURNING id` com expiração e limite de tentativas; incremento de tentativas condicionado. | Testar concorrência em PostgreSQL real. |
| S-05 | **Média** | Aplicação só limitava alguns endpoints; um conjunto grande de IPs podia sobrecarregar pool SQL e operações `scrypt` | Limite HTTP por IP, download de uploads, HTTP estático; até **80 APIs simultâneas** e **8 operações de autenticação custosas**; prazos HTTP e PostgreSQL (query/statement); pool máximo 12. | Limites de aplicação não substituem proteção externa DDoS/WAF. |
| S-06 | **Média** | `io` aceitava `Origin` de outro site, inclusive clientes web; facilitação de abuso cruzado | Bloqueio de origens web diferentes do Host HTTPS, com exceção HTTP localhost para testes; clientes nativos sem Origin continuam sob quotas. | Confirmar navegador do APK/PWA e clientes reais. |
| S-07 | **Média** | `DB_SSL_VERIFY=0` permitia desativar verificação TLS do Neon, risco de interceptação | A opção insegura foi removida; certificado TLS remoto sempre verificado; CA própria continua possível com `DB_SSL_CA`. | Confirmar conexão TLS com Neon no ambiente de produção. |
| S-08 | **Média** | Relatórios CSP podiam incluir URLs com parâmetros privados, e contador por diretiva não tinha limite de chaves | Redação de query string/fragmentos para relatórios públicos e logs, 80 chaves máximas e limpeza do registro de IPs; mapas de abuso de criação de salas, uploads e relatórios CSP têm tetos de entradas. | Monitorar dados observados no Render após deploy. |
| S-09 | **Média** | Dependências sem gate de CVEs conhecido no PR | Novo workflow `.github/workflows/seguranca-dependencias.yml`: `npm ci`, `npm audit --omit=dev --audit-level=high`, novos testes e regressão completa. | **Não validado** ainda; falhas devem bloquear Merge. |

Observação: os níveis descrevem o potencial impacto dos padrões encontrados no código, **não ataques confirmados** ao jogo. O código prévio já tinha limites de upload (1,5 MB e cotas), proteção de tentativas de sala, hashes `scrypt`, tokens aleatórios com hash no banco, autorização SQL para amigos e progresso, validação de encaixe no servidor e XP exclusivo via `payMatch`. Esses contratos permanecem.

## Riscos e validações pendentes — NÃO TRATADOS COMO APROVADOS

1. **Alto — DoS distribuído/capacidade do Render:** limites em Node não neutralizam saturação do link ou do proxy. Contratar/provisionar camada de proteção (WAF/CDN e rate limiting na borda, limites por origem, alertas, plano Render com capacidade suficiente) e realizar testes controlados **somente em ambiente separado autorizado**. Não foi realizado teste contra Render público.
2. **Médio/alto conforme cenário — CSP em modo `report`:** política de scripts existe, mas somente impede `frame-ancestors` enquanto `CSP_MODE=report`. Avaliar ativação **`CSP_MODE=enforce`** após validar navegação, Google, Socket.IO, PWA, imagens e relatório de violações em pré-produção, antes da publicação pública. Token do dono fica em `localStorage`, que pode ser lido por JavaScript caso ocorra XSS; revisão de toda entrada no DOM é contínua.
3. **Médio — Segurança operacional:** não houve acesso às permissões do Neon, política de backup, rotatividade das credenciais Render/Brevo, DNS, controles do repositório, alertas, logs e certificados instalados no Android. Configurar controle de acesso mínimo, senhas e segredos somente em variáveis de ambiente, backups com teste de restauração, alertas e plano de resposta.
4. **Médio — Disponibilidade:** salas atuais ficam na memória do processo e são perdidas quando o Render reinicia/dorme. Nenhuma mudança estrutural no fluxo foi feita; para garantir alta disponibilidade futura será necessário serviço adequado e persistência/capacidade planejada.
5. **Médio — Autenticação em múltiplas instâncias:** cotas por IP/sala são em memória e só valem para **uma instância**. A configuração atual é de serviço único; para várias instâncias será necessário store/limiter compartilhado (ex. Redis) e adaptador Socket.IO.
6. **Pendente — CVEs transitivas:** o registro npm não ficou disponível localmente. O workflow deve executar `npm audit` no GitHub Actions. Se houver achado alto/crítico, **não fazer Merge** e corrigir dependências em nova rodada.

## Testes comprovados nesta rodada

- `node --check` nos JS alterados: aprovado.
- `node --test tests/security-resilience.test.js`: **14 testes aprovados**; teste unitário do limitador, simulação **20.000** tentativas em memória (sem internet), limites HTTP, sockets simulados, origem, concorrência, TLS, revogação por inspeção estática e gate de CI. **Testes isolados, não são Socket.IO real.**
- Regressão estática selecionada do projeto (`NODE_PATH` para stub apenas na importação do `socket.io-client`): **103 testes no total, 101 aprovados, 0 falhas, 2 ignorados** (PostgreSQL real); `socket.io-client` foi apenas simulado para carregar os testes estáticos, sem executar integração real.
- Nenhum teste de carga foi enviado ao Render, Neon ou outros serviços. Nenhuma alteração foi realizada no GitHub ou no ambiente publicado.
- **Não testados:** HTTP Express real, Socket.IO real, banco PostgreSQL real, `npm audit` via registro npm (instalação de dependências incompleta por indisponibilidade de rede no ambiente), produção Render/Neon, Chrome/PWA/Android real e cenários de ataque distribuído. **Não usar testes locais como prova de segurança em produção.**

## Contratos de experiência preservados

- Nenhum arquivo `public/*` foi modificado: interface, cores, sons, fontes, animações, imagens, 360°, posicionamento das peças, magnetismo e tela cheia permanecem idênticos.
- Não mudou `migrations/*`, `xp.js`, `gems.js`, `library.js`, `phrases.js` nem `public/assetlinks.json`.
- Mantidos eventos Socket.IO existentes, regra SNAP/encaixe do servidor e desafio, compras com gemas somente no servidor, histórico, frases prontas e privacidade dos outros jogadores.
- Quando um limite é atingido, o servidor retorna erro `busy` ou `rate` ou desconecta pacotes excessivos; isso é intencional para proteger disponibilidade, sem mudar a navegação normal.

## Publicação e plano de retorno

1. Preserve o commit-base `8928aca2862ea0646bf111e4da964cd365abff63`. Não publicar diretamente em `main`.
2. Envie os arquivos do ZIP de segurança em **uma ramificação nova**, abra PR e confira a lista exata.
3. Aguarde **dois** workflows verdes: a regressão PostgreSQL já existente e a nova auditoria com `npm audit`; falha em qualquer um = **não fazer Merge**.
4. Após aprovação, faça Merge e deploy manual; teste no Android as duas modalidades e em duas contas: login, logout em todos os aparelhos, código de recuperação, amigos/convites, conclusão, biblioteca, gemas, tela cheia e animações.
5. Se houver regressão, **reverta exclusivamente o PR de segurança** a partir de uma nova branch, sem editar migrações históricas e sem apagar dados do Neon. Uma cópia completa do projeto antes desta rodada foi preservada em ZIP separado para uso pessoal, não deve ser enviada ao repositório.
6. Só decidir sobre liberação pública após os riscos altos remanescentes receberem mitigação e validação externa.

**Referências normativas:** OWASP API Security Top 10 2023 (API2 Broken Authentication, API4 Unrestricted Resource Consumption, API8 Security Misconfiguration) e documentação Socket.IO 4 (limites por mensagem e middleware). Aplicação parcial das medidas, sem pretensão de certificação OWASP completa.
