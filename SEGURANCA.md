# Segurança: o que mudou e o passo a passo para colocar no ar

> Este guia cobre: frases prontas, limite de tentativas no código da sala, bloquear jogadores, código de confirmação por e-mail,
> recuperar e trocar a senha, cabeçalhos de segurança (CSP em modo "só relatar") e a verificação do certificado do banco.

## 1. Ordem recomendada (leva uns 30 minutos)

1. **Publicar o código** no GitHub (seção 2). O jogo continua funcionando como hoje: o e-mail ainda está desligado.
2. **Conferir** em `https://SEU-APP.onrender.com/diagnostico` (seção 3).
3. **Ligar o e-mail** (Brevo, seção 4). Só aqui as contas passam a pedir o código.
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

Abra `/diagnostico`. Em `contas` deve aparecer `"ativas": true`. Em `seguranca` você vê:
`cabecalhos` (ativos), `csp.modo` (`report`), `tamanho_do_codigo_da_sala` (6), `limite_de_tentativas` e `email` (`não configurado — faltam as variáveis: ...` até a seção 4; mostra só os **nomes** do que falta).

Se `contas.ativas` for `false` logo após esta atualização, quase certamente é o **certificado do banco** (seção 7): veja os registros (Logs) do Render.

## 4. Código por e-mail (Brevo, plano gratuito)

**Por que não SMTP:** o Render gratuito **bloqueia** as portas de SMTP (25, 465 e 587). Por isso o jogo envia e-mails por uma **API web** (HTTPS).
Segundo o site do Brevo na minha consulta, o plano gratuito permite **300 e-mails por dia** (esses limites mudam: confira no site antes de depender disso).

1. Crie uma conta em **brevo.com** (grátis, sem cartão) e confirme o seu e-mail. A Brevo pode pedir dados extras ou analisar a conta antes de liberar os envios.
2. Cadastre o **remetente**: em *Senders, domains & dedicated IPs* > *Senders* > *Add a sender* (nome do jogo + um e-mail seu). Abra o e-mail que a Brevo enviar e confirme.
   Dica: remetentes de e-mail gratuito (Gmail, Outlook) podem ter pior entrega e cair em **spam**; a tela do jogo já avisa para olhar a caixa de spam.
3. Crie a **chave da API**: *SMTP & API* > *API keys* > *Generate a new API key*. Copie a chave (começa com `xkeysib-`); ela só aparece uma vez.
   Se existir a opção de restringir por **IP autorizado**, deixe **desativada** (o Render gratuito não tem IP fixo).
4. No Render, em *Environment*, crie estas variáveis (uma por linha, **sem espaços antes ou depois do valor**):
   - `BREVO_API_KEY`: a chave da API (começa com `xkeysib-`).
   - `BREVO_SENDER_EMAIL`: o e-mail remetente **já confirmado** no Brevo.
   - `BREVO_SENDER_NAME` (opcional): o nome que aparece como remetente. Sem ela, usa "Quebra-cabeça a dois".

   O e-mail só fica **ligado** quando `BREVO_API_KEY` e `BREVO_SENDER_EMAIL` existem e não estão vazias. Ao salvar, escolha **Save, rebuild & deploy** (ou *Deploy only*) para o Render reiniciar com os valores novos.
5. Confira em `/diagnostico`: `email: "configurado (brevo)"`. Crie uma conta de teste com um e-mail seu: o código deve chegar em até 1 minuto.

**Como funciona:** ao criar a conta, a pessoa recebe um código de 6 números (vale 15 minutos, no máximo 5 erros, depois o código "queima") e **só entra depois de digitá-lo**.
O mesmo vale para **recuperar a senha** ("Esqueci minha senha" na tela de entrada). O código fica no banco só como hash.

**Contas que já existem:** ao ligar o e-mail, elas pedem a confirmação **no próximo login** (o código é enviado na hora). Contas do Google já vêm confirmadas.
Se uma conta nova nunca for confirmada **e estiver parada** (sem amigos, partidas ou progresso), o endereço **não fica preso**: o dono verdadeiro pode se cadastrar com ele.
Se a conta não confirmada **já tem atividade**, ela **nunca é apagada** por um novo cadastro (ninguém destrói a conta de outra pessoa digitando o e-mail dela): o dono recupera pelo *Esqueci minha senha*.

**Se o e-mail parar** (chave errada, limite do dia): novos cadastros e recuperações falham com aviso, e **nenhuma conta pela metade é criada**; quem já está confirmado continua entrando normalmente.
No Render (Logs), `[contas] e-mail não enviado: Brevo respondeu 401` = chave errada; `400/403` = remetente não confirmado ou restrição de IP.

## 5. Trocar a senha

- **Logado:** Perfil > Segurança > *Trocar minha senha* (pede a senha atual; desconecta os outros aparelhos).
- **Esqueci:** tela de entrada > *Esqueci minha senha* (código por e-mail; todas as sessões abertas caem).
- **Sair de todos os aparelhos:** Perfil > Segurança.
- Senhas: mínimo de 8 caracteres; recusamos as muito comuns (`12345678`, `senha123`…), repetidas e iguais ao nome ou ao e-mail.

## 6. Cabeçalhos de segurança e CSP

Todas as respostas agora levam: `Strict-Transport-Security` (180 dias, só em HTTPS), `X-Content-Type-Options: nosniff`,
`X-Frame-Options: DENY` e `frame-ancestors 'none'` (**ninguém embute o jogo em outro site**), `Referrer-Policy`, `Permissions-Policy`
(câmera, microfone, localização… desligados) e `Cross-Origin-Opener-Policy` (compatível com o login do Google).

A **política de conteúdo (CSP)** começa em **`report`** (só relata, não bloqueia nada). Ela já é rígida: sem script inline (o único foi movido para `boot.js`),
sem sites externos além do Google, e a conexão em tempo real só para o próprio endereço do jogo.

- Veja o que ela relataria em `/diagnostico` > `seguranca.csp` (`violacoes_registradas`, `por_regra`, `ultimas`).
- **Nos meus testes, com a CSP obrigatória, o jogo inteiro rodou com 0 violações.** Mas isso foi em celular simulado.
- Depois de **1 a 2 semanas de uso real com 0 violações**, ligue a obrigatória: no Render crie `CSP_MODE` = `enforce`. Para voltar atrás, apague a variável (ou use `off`).
- Se for ligar o login do Google depois, repita o teste (a política já libera `accounts.google.com/gsi/`).

## 7. Certificado do banco (Neon)

Antes a conexão era criptografada mas **aceitava qualquer certificado**. Agora o servidor **confere** o certificado do banco. Pelo que sei, o Neon usa certificado de uma autoridade pública e isso deve funcionar sem você fazer nada, **mas não consegui testar contra o Neon daqui**.
O que testei: com um banco de certificado inválido (autoassinado), a conexão é **recusada**, e só conecta com a saída de emergência abaixo.

Se após publicar o `/diagnostico` mostrar `contas.ativas: false` e os Logs tiverem `[contas] NÃO foi possível ativar as contas ... certificate`:
1. (Emergência) crie no Render `DB_SSL_VERIFY` = `0` (volta ao comportamento antigo) e me avise para ajustarmos o certificado.
2. O jogo, enquanto isso, **continua funcionando como visitante**.

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
  1 vitória (2) · 5 vitórias · 3 quebra-cabeças concluídos · 1 amigo · 1 imagem própria. As travadas aparecem com 🔒 e dizem o que falta.
- Limite de velocidade: não dá para "metralhar" frases.

**Bloquear jogador:** em *Amigos* > **⋯** > *Bloquear*; ou no menu da partida > *⛔ Bloquear jogador* (quando o outro tem conta). Quem é bloqueado **não te acha na busca, não pede amizade, não te convida e não entra nas suas salas, nem sabendo o código**; a amizade acaba e **ele não recebe aviso de bloqueio** (para ele, a pessoa simplesmente some da lista de amigos, como se a amizade tivesse sido desfeita).
Desbloquear: Perfil > Segurança > *Jogadores bloqueados*. Visitantes (sem conta) não podem ser bloqueados individualmente; o limite de tentativas protege as salas.

## 9. Roteiro de teste com dois celulares (10 minutos)

1. Celular 1: criar conta > aparece a tela do código > digitar o código do e-mail > entra.
2. Celular 2: o mesmo com outro e-mail. Adicionem-se pelo código de amigo.
3. Convite para jogar > os dois na mesma sala > abrir a conversa: **só botões de frases**, sem campo de texto.
4. Celular 1: *Amigos* > **⋯** > *Bloquear* o celular 2 > ele some; o celular 2 não acha mais o código do 1. Desbloquear em Perfil > Segurança.
5. Em um terceiro aparelho (ou aba anônima): digitar 6 códigos de sala errados > aparece "Muitos códigos errados… espere 15 min".
6. *Esqueci minha senha* > código > senha nova; e *Trocar minha senha* no perfil.
7. `/diagnostico`: `csp.violacoes_registradas` deve continuar em 0.

## 10. O que eu **não** consegui verificar (honestidade)

- Neon, Brevo, Render e o login do Google **reais**: testei com simulações (banco PostgreSQL local, API de e-mail falsa, chaves do Google falsas).
- O menu de preenchimento automático do navegador no seu celular: confirmei que não há mais campo de senha solto e que o campo do código está marcado como "não é login".
- Aparelhos Android/iPhone de verdade (só celular simulado).
- Um ataque coordenado com muitos endereços, ou com acesso pelo mesmo Wi-Fi da escola (todos compartilhariam o mesmo endereço e o mesmo limite).

## 11. Fora desta etapa (para decidir depois)

Confirmação de responsável para crianças (precisa de orientação jurídica, LGPD art. 14), análise automática de fotos enviadas, denúncia de jogadores e painel de moderação.
