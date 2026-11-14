# Segurança: o que mudou e o passo a passo para colocar no ar

> Este guia cobre: frases prontas, limite de tentativas no código da sala, bloquear jogadores, **perfil gerado (ID + código-chave)**,
> cabeçalhos de segurança (CSP em modo "só relatar") e a verificação do certificado do banco.
> **Atualização (perfil gerado):** não existem mais e-mail, senha, Google, amigos nem convites no jogo. As seções 4 e 5 abaixo foram reescritas;
> o relatório completo desta etapa está em `docs/AUDITORIA_SEGURANCA.md` (e `docs/SEGURANCA_INVENTARIO.md`, `docs/CONTROLES_LGPD_ECA.md`, `docs/RESPOSTA_INCIDENTES.md`, `docs/MIGRACAO_E_ROLLBACK.md`).

## 0. Token do `/diagnostico` (faça primeiro)

O `/diagnostico` mostra configuração interna (limites, CSP, perfis). Por isso o detalhe só aparece com um token:

1. No Render, **Environment > Add Environment Variable**: nome `DIAG_TOKEN`, valor = texto **aleatório de 24 caracteres ou mais** (por exemplo, gere com o botão de gerar valor do Render, ou `openssl rand -hex 24` no computador). Valores curtos são ignorados (e o log avisa).
2. Abra `https://SEU-APP.onrender.com/diagnostico?token=SEU_TOKEN`. Sem token, ou com token errado, aparece só o essencial (pacote Android e impressões digitais, que já são públicos).
3. Para ferramentas e scripts, prefira enviar o token no cabeçalho `Authorization`, com o valor `Bearer` seguido de um espaço e do token (por exemplo, no Postman). Aberto no navegador, o token fica no histórico: se alguém mais usar o aparelho, troque o valor no Render.
4. Dez tentativas **erradas** bloqueiam o endereço por 10 minutos (nem o token certo entra nesse período).
5. Nunca coloque o token no GitHub, em conversa ou em print.

(Nos passos abaixo, onde estiver "abra `/diagnostico`", use o endereço com `?token=SEU_TOKEN`.)

## 1. Ordem recomendada (leva uns 30 minutos)

1. **Publicar o código** no GitHub (seção 2). O jogo continua funcionando como hoje.
2. **Conferir** em `https://SEU-APP.onrender.com/diagnostico?token=SEU_TOKEN` (seção 3).
3. **(Opcional) Ligar o aviso de denúncia por e-mail** (Brevo, seção 4). O jogo em si não envia e-mails a jogadores.
4. **Testar com dois celulares** (seção 9).
5. Depois de alguns dias, **ligar a CSP obrigatória** (seção 6).

## 2. O que enviar ao GitHub

Substitua ou adicione, mantendo as pastas (o `LEIA-ME.txt` do zip tem a mesma lista):

| Onde | Arquivo | Situação |
|---|---|---|
| raiz | `server.js`, `challenge.js`, `accounts.js`, `db.js` | substituir |
| raiz | `security.js`, `phrases.js`, `mailer.js` | **novos** |
| raiz | `render.yaml`, `README.md`, `SEGURANCA.md` | substituir/novo (documentação) |
| `migrations/` | `002_seguranca.sql` | **novo** (as tabelas novas são criadas sozinhas ao ligar) |
| `public/` | `index.html`, `style.css`, `game.js`, `conta.js`, `sw.js` | substituir |
| `public/` | `boot.js` | **novo** |

**Não** envie: `package.json` e `package-lock.json` (não mudaram) nem `public/privacidade.html` (para não apagar o seu e-mail de contato).
Também **não** existe mais nenhum `moderation.js`: não há filtro de fotos nesta versão.

## 3. Conferir que ligou

Abra `/diagnostico?token=SEU_TOKEN`. Em `contas` deve aparecer `"ativas": true`. Em `seguranca` você vê:
`cabecalhos` (ativos), `csp.modo` (`report`), `tamanho_do_codigo_da_sala` (6), `limite_de_tentativas` e `email` (`não configurado — faltam as variáveis: ...` até a seção 4; mostra só os **nomes** do que falta).

Se `contas.ativas` for `false` logo após esta atualização, quase certamente é o **certificado do banco** (seção 7): veja os registros (Logs) do Render.

## 4. Brevo: só o aviso de denúncia ao responsável (opcional)

**O jogo não envia mais código por e-mail a jogadores**: não há cadastro por e-mail, confirmação nem "esqueci minha senha". O Brevo ficou só para avisar o responsável de cada denúncia (seção 12).

**Por que não SMTP:** o Render gratuito **bloqueia** as portas de SMTP (25, 465 e 587). Por isso o jogo envia e-mails por uma **API web** (HTTPS).
O plano gratuito do Brevo tem limite diário de envios (esses limites mudam: confira no site antes de depender disso).

1. Crie uma conta em **brevo.com** (grátis, sem cartão) e confirme o seu e-mail. A Brevo pode pedir dados extras ou analisar a conta antes de liberar os envios.
2. Cadastre o **remetente**: em *Senders, domains & dedicated IPs* > *Senders* > *Add a sender*. Abra o e-mail que a Brevo enviar e confirme.
3. Crie uma **chave de API** (começa com `xkeysib-`) e, no Render (**Environment**), as variáveis `BREVO_API_KEY` e `BREVO_SENDER_EMAIL` (o remetente já confirmado); opcional: `BREVO_SENDER_NAME`.
4. Ao salvar, escolha **Save, rebuild & deploy** para o Render reiniciar com os valores novos.
5. Faça uma denúncia de teste e confira o e-mail (seção 12). Sem as variáveis, as denúncias **continuam salvas no banco**; só o aviso por e-mail fica desligado.

**Se o e-mail parar** (chave errada, limite do dia): nada de perfil ou partida é afetado. No Render (Logs), `Brevo respondeu 401` = chave errada; `400/403` = remetente não confirmado ou restrição de IP.

## 5. Perfil gerado: código-chave (substitui "trocar a senha")

- **Criar:** o jogo gera o ID (8 caracteres, público) e o código-chave (20 caracteres, segredo, mostrado **uma vez**). No banco fica só o hash scrypt.
- **Perdeu o código?** Não há recuperação (não existe e-mail). É um aviso que o jogo dá na criação e a pessoa confirma ("anotei").
- **Suspeita de vazamento:** Perfil > Segurança > *Gerar código novo* (pede o código atual; o antigo deixa de valer na hora e os outros aparelhos saem).
- **Sair de todos os aparelhos:** Perfil > Segurança.
- **Apagar:** Perfil > *Apagar meus dados…* (digite EXCLUIR + código-chave).
- Limites: 8 erros por ID e 20 por endereço a cada 15 minutos; 6 perfis novos por hora por endereço. Detalhes e testes: `docs/AUDITORIA_SEGURANCA.md`.

## 6. Cabeçalhos de segurança e CSP

Todas as respostas agora levam: `Strict-Transport-Security` (180 dias, só em HTTPS), `X-Content-Type-Options: nosniff`,
`X-Frame-Options: DENY` e `frame-ancestors 'none'` (**ninguém embute o jogo em outro site**), `Referrer-Policy`, `Permissions-Policy`
(câmera, microfone, localização… desligados) e `Cross-Origin-Opener-Policy` (sem login de terceiros).

A **política de conteúdo (CSP)** começa em **`report`** (só relata, não bloqueia nada). Ela já é rígida: sem script inline (o único foi movido para `boot.js`),
sem nenhum site externo, e a conexão em tempo real só para o próprio endereço do jogo.

- Veja o que ela relataria em `/diagnostico` > `seguranca.csp` (`violacoes_registradas`, `por_regra`, `ultimas`).
- **Testada para `enforce` (rodada `seguranca-play`):** com `CSP_MODE=enforce` percorri o jogo (rodada `seguranca-play`: início com o pet, Ajustes, Loja, tutorial, partida solo com arrasto e recorte da imagem, Sala Desafio, tela de entrada e service worker; na rodada do perfil gerado, repeti criar perfil, copiar código, sair, entrar, gerar código novo e apagar, tudo com `enforce`) escutando todo evento de violação: **0 violações**, e o `/diagnostico` também ficou em 0. Foi em navegador de teste (desktop headless), não em Android real.
- **Para ligar:** no Render crie `CSP_MODE` = `enforce`, jogue uma partida completa em dois celulares, abra o Perfil e a Loja. Se algo quebrar, apague a variável (volta ao modo `report`). Acompanhe `seguranca.csp.violacoes_registradas` durante o teste fechado da Play: deve continuar em 0.
- Os testes do projeto impedem o que quebraria o `enforce`: script embutido, atributo `onclick=` e similares, `javascript:`, `eval` e recurso de outro site (não há exceção para o Google: o login dele foi removido).

### 6.1 Trusted Types (só relatório, nunca obrigatório)

Além da CSP, o servidor manda `Content-Security-Policy-Report-Only: require-trusted-types-for 'script'` (nos modos `report` e `enforce`). É um **segundo cinto**: o navegador **avisa** se algum código tentar escrever HTML ou carregar script por um caminho perigoso, mas **não bloqueia nada**.

- No `game.js` existe uma política `qc` estreita: só libera os endereços `/sw.js` e `crop-worker.js` e o desenho fixo da caixa de presentes. Qualquer outro valor é recusado.
- Para esvaziar um elemento o código usa `textContent = ''` (até `innerHTML = ''` aparece como aviso). O teste `tests/sem-html-injetado.test.js` falha se alguém voltar a usar `innerHTML` (fora da caixa de presentes).
- Como ler: `/diagnostico?token=…` > `seguranca.csp.porRegra`. A regra `require-trusted-types-for` deve ficar em **0**. Se subir, algum código novo escreve HTML: corrija no código, não na política.
- **Não** transforme em obrigatório (`Content-Security-Policy`) sem testar no Android real e sem pelo menos um ciclo sem avisos. Só navegadores baseados em Chromium aplicam isso; Safari e Firefox ignoram o cabeçalho, e isso **não foi testado** neles.

## 7. Certificado do banco (Neon)

Antes a conexão era criptografada mas **aceitava qualquer certificado**. Agora o servidor **confere** o certificado do banco. Pelo que sei, o Neon usa certificado de uma autoridade pública e isso deve funcionar sem você fazer nada, **mas não consegui testar contra o Neon daqui**.
O que testei: com um banco de certificado inválido (autoassinado), a conexão é **recusada**, e só conecta com a saída de emergência abaixo.

Se após publicar o `/diagnostico` mostrar `contas.ativas: false` e os Logs tiverem `[contas] NÃO foi possível ativar as contas ... certificate`:
1. **Não desative a verificação TLS.** O servidor passou a ignorar `DB_SSL_VERIFY=0`; corrija o certificado ou use `DB_SSL_CA` com a CA confiável do provedor. Não coloque a chave privada no GitHub.
2. O jogo, enquanto isso, **continua funcionando como visitante**. Não prossiga com a publicação pública até validar o banco e as contas.

### Rodada de segurança — 31/10/2026

Foram adicionados limites de recursos em `resource-guard.js`, expiração de requisições HTTP e consultas SQL, invalidação de sessões no Socket.IO, associação de origem dos sockets, consumo atômico de códigos de e-mail e sanitização de relatórios CSP. A rota HTTP `/api/test-outbox` foi completamente removida, evitando exposição de códigos de recuperação inclusive por erro de configuração. O Pull Request executará `npm audit --omit=dev --audit-level=high` na nova auditoria GitHub Actions. **Não considerar a publicação pública aprovada sem testar no PostgreSQL real e proteger o tráfego na borda (WAF/CDN).** Detalhes e limitações estão em `AUDITORIA-SEGURANCA-2026-10-31.md`.

## 8. Código da sala, tentativas, frases e bloqueios

**Código da sala:** agora tem **6 caracteres** (antes 4). São 32 caracteres possíveis: 1.073.741.824 combinações (antes 1.048.576).
**Limite de tentativas (por endereço de internet):**

| Situação | Resultado |
|---|---|
| 6 códigos errados em 15 minutos | bloqueio de **15 min** |
| volta a errar depois do bloqueio | **1 h**, depois **6 h**, depois **24 h** |
| 30 erros em um dia | bloqueio de **24 h** |
| código certo durante o bloqueio | **também é recusado** |
| tentar de novo o mesmo código em poucos segundos | conta como 1 erro só (evita punir toque duplo) |

Conta de risco: com 50 salas abertas e no máximo 30 palpites por dia por endereço, a chance de acertar alguma sala é de cerca de **0,0001% por dia por endereço**,
e de uns **0,14% por dia** mesmo que alguém use **1.000 endereços diferentes**. Não é zero, é muito pouco provável. (Com 4 caracteres seriam ~100%.)
Ajustes pelo Render (opcionais): `CODE_LEN` (4 a 8), `JOIN_MAX_FAILS`, `JOIN_DAILY_MAX`.

**Frases prontas (a conversa livre acabou):** ninguém digita texto. O celular manda só o código da frase e o servidor escreve o texto.
- **10 frases básicas, sempre liberadas:** Oi! · Vamos jogar? · Boa! · Muito bem! · Quase lá! · Calma, vai dar certo! · Preciso de ajuda · Estou pensando... · Obrigado(a)! · Até logo!
- **7 reações com emoji** (sempre liberadas): 👍 😂 👏 😮 🤔 ❤️ 🎉
- **14 frases liberadas jogando** (só para quem tem conta, porque o servidor precisa saber o seu progresso): 1 partida (2 frases) · 3 partidas (2) · 5 partidas · 10 partidas (2) · 25 partidas ·
  1 vitória (2) · 5 vitórias · 3 quebra-cabeças concluídos. As travadas aparecem com 🔒 e dizem o que falta.
- Limite de velocidade: não dá para "metralhar" frases.

**Bloquear jogador:** no menu da partida > *⛔ Bloquear jogador* (quando o outro tem perfil). Quem é bloqueado **não entra nas suas salas, nem sabendo o código**, e **não recebe aviso de bloqueio**.
Desbloquear: Perfil > Segurança > *Jogadores bloqueados*. Visitantes (sem conta) não podem ser bloqueados individualmente; o limite de tentativas protege as salas.

## 9. Roteiro de teste com dois celulares (10 minutos)

1. Celular 1: criar perfil > aparece a tela do código-chave > anotar > marcar "anotei" > entrar.
2. Celular 2: o mesmo (outro perfil). Cada um vê só o próprio apelido sorteado.
3. Celular 1 cria uma sala e passa o código da sala > celular 2 entra > os dois aparecem como "Jogador 1/2" > abrir a conversa (se ligada): **só botões de frases**, sem campo de texto.
4. Celular 1: menu da partida > *Bloquear jogador* > o celular 2 não entra mais nas salas do 1 (nem sabendo o código). Desbloquear em Perfil > Segurança.
5. Em um terceiro aparelho (ou aba anônima): digitar 6 códigos de sala errados > aparece "Muitos códigos errados… espere 15 min".
6. *Gerar código novo* > o antigo não entra mais; *Sair* e *Entrar* com o novo.
7. `/diagnostico`: `csp.violacoes_registradas` deve continuar em 0.

## 10. O que eu **não** consegui verificar (honestidade)

- Neon, Brevo e Render **reais**: testei com simulações (banco PostgreSQL local e API de e-mail falsa).
- O comportamento do preenchimento automático e do gerenciador de senhas no seu celular (o campo do código-chave é marcado como "não é senha", mas só o aparelho real confirma).
- Aparelhos Android/iPhone de verdade (só celular simulado).
- Um ataque coordenado com muitos endereços, ou com acesso pelo mesmo Wi-Fi da escola (todos compartilhariam o mesmo endereço e o mesmo limite).

## 11. Fora desta etapa (para decidir depois)

Confirmação de responsável para crianças (precisa de orientação jurídica, LGPD art. 14), análise automática de fotos enviadas, denúncia de jogadores e painel de moderação.

## 12. Denúncias e moderação (exigência da Play Store para jogos com apelidos)

Quem joga pode **denunciar** um apelido, avatar ou comportamento. A pessoa denunciada **nunca é avisada**. Só você lê, no **SQL Editor do Neon** (somente leitura para ver; as ações abaixo mudam dados, use com cuidado):

```sql
-- denúncias novas (mais recentes primeiro)
select r.id, r.created_at, r.reason, r.context, r.reported_name, r.note, u.friend_code as codigo_denunciado
from reports r join users u on u.id = r.reported
where r.status = 'novo' order by r.created_at desc;

-- quantas denúncias cada pessoa recebeu
select u.friend_code, u.name, count(*) as denuncias from reports r join users u on u.id = r.reported group by 1, 2 order by 3 desc;
```

**Ações** (escolha uma por caso; depois marque como analisada):

```sql
-- 1) trocar um apelido ofensivo
update users set name = 'Jogador', avatar = '' where friend_code = 'XXXXXXXX';
-- 2) excluir a conta de quem desrespeita os outros (apaga tudo dela, inclusive as denúncias ligadas a ela)
delete from users where friend_code = 'XXXXXXXX';
-- 3) marcar como analisada
update reports set status = 'analisado' where id = 123;
```

### Aviso por e-mail a cada denúncia nova

Cada denúncia **nova** chega ao seu e-mail (pelo Brevo). A mesma denúncia repetida em 24 h não gera outro e-mail. O e-mail traz o **ID** (coluna `friend_code`) da pessoa denunciada (já no formato certo para o SQL), o apelido, o motivo, onde foi feita, a nota e **os comandos prontos** para o Neon: trocar o apelido, excluir a conta ou marcar como analisada. É só abrir o **SQL Editor do Neon**, colar o comando e rodar.

**Para quem vai:** por padrão, para o e-mail **remetente confirmado no Brevo** (`BREVO_SENDER_EMAIL`). Para mandar a outro endereço, crie no Render (Environment) a variável `REPORT_NOTIFY_EMAIL` com o seu e-mail. Um valor com formato estranho **desliga** o aviso (nunca envia a endereço duvidoso).

**Conferir se ligou:** abra `/diagnostico` e veja `contas › avisos_de_denuncia_por_email`: deve mostrar `ligado: true` e o destino mascarado (por exemplo `h***@gmail.com`). Se mostrar `ligado: false`, o campo `problema` explica o motivo.

**Limite contra enchente:** até 20 e-mails por hora (variável opcional `REPORT_MAIL_MAX_PER_HOUR`; `0` desliga os avisos). Passando disso, as denúncias **continuam salvas** no banco e o próximo e-mail diz quantas ficaram de fora. Se o Brevo estiver fora do ar, a denúncia também é salva normalmente.

**Segurança do aviso:**
- O e-mail **nunca** traz o e-mail, o código nem o apelido de **quem denunciou**, só o que é preciso para agir contra a pessoa denunciada.
- Apelido e nota são texto de jogador: saem sem quebras de linha, escapados no HTML, sem links e **nunca dentro dos comandos SQL** (só o ID, conferido contra o alfabeto do jogo).
- Ative a **verificação em duas etapas** no e-mail que recebe os avisos, não encaminhe esses e-mails e apague-os depois de resolver. **Só rode comandos de e-mails que chegaram do próprio jogo** e confira o código antes de executar.
- O Brevo (plano gratuito) tem limite diário de envios, dividido com os códigos de confirmação.

- **Prazo que a política promete:** responder a pedidos em até 15 dias. Olhe `reports` pelo menos uma vez por semana.
- **Risco imediato** (ameaça, conteúdo ilegal): exclua a conta primeiro, depois avalie se precisa avisar as autoridades.
- Limites: 15 denúncias por hora por pessoa; a mesma denúncia repetida em 24 h conta uma vez. Cada denúncia aceita uma nota de até 200 letras.

## 13. Antes de gerar o AAB da Play Store (segurança e política)

**Feito no código (rodada `seguranca-play`):** `/diagnostico` com token, CSP testada para `enforce`, aviso curto de segurança online, README corrigido (sem upload nem chat livre).

**No Render (você):**
1. Crie `DIAG_TOKEN` (seção 0) e, depois de testar, `CSP_MODE=enforce` (seção 6).
2. Confira `DATABASE_URL` e `BREVO_API_KEY`; troque qualquer chave que já tenha aparecido em conversa, print ou arquivo. (`DB_SSL_VERIFY=0` é ignorado de propósito: o certificado do banco é sempre conferido.)
3. O plano grátis **dorme**: o revisor da Play e os testadores veriam tela em branco por 20 a 60 s. Antes da revisão, use um plano que não durma (ou um ping de manutenção).
4. Confirme a retenção de backup do banco (Neon) antes de ter jogadores reais.

**Na geração do AAB:**
5. O aplicativo novo precisa mirar o **Android 16 (API 36)**. Confira o AAB: `bundletool dump manifest --bundle app.aab` e procure `targetSdkVersion` (36 ou mais). Se vier menor, gere de novo com uma versão atual do PWABuilder ou do Bubblewrap.
6. Pacote `com.onrender.quebra_apk.twa` (o mesmo do `assetlinks.json`; não muda depois de publicado). Guarde a chave de envio e as senhas em **dois lugares fora do GitHub**.
7. Com **Play App Signing** (padrão), a Google reassina o app. Depois do primeiro envio, copie a impressão digital SHA-256 da **chave de assinatura do app** (Integridade do app) e **some** ao `public/assetlinks.json`; só então o app abre sem barra de endereço.

**No Play Console:**
8. Conta pessoal nova: teste fechado com **12 testadores por 14 dias seguidos**, depois o pedido de acesso à produção. Conta de organização é isenta.
9. **Público-alvo (decidido em 13/11/2026):** **não indicado para menores de 16 anos** (marque 16–17 e 18 ou mais; ver `PLAY-STORE.md`, seção 3). A tela de idade neutra e a criação de perfil 16+ já estão no app. Leve ao profissional as perguntas jurídicas listadas em `PLAY-STORE.md` (ECA Digital, LGPD). O login com o Google está desligado no seu Render, então a dúvida sobre ele em app com menores não se aplica hoje.
10. Formulários: segurança de dados (link de exclusão: `/excluir-conta.html`), classificação de conteúdo, instruções de acesso (o modo visitante entra sem conta), e-mail de suporte. **Reveja o e-mail de contato da política de privacidade** (`herbert.uva.unversidade@gmail.com`: confira se "unversidade" não é erro de digitação).
