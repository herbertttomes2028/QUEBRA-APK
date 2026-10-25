# Contas, amigos e convites — guia de configuração (passo a passo)

> Tempo estimado: 20 a 30 minutos, uma única vez. Você vai criar **uma conta gratuita num serviço de banco de dados**, copiar **um endereço** e colá-lo no Render.
> Nunca cole senhas ou esse endereço no GitHub, em conversas ou em prints.

## O que existe e por quê

| Peça | Escolha | Por quê |
|---|---|---|
| Servidor | o mesmo Node/Express/Socket.IO de sempre (Render) | nada novo para manter; o tempo real (convites, amigos online) já usa o Socket.IO |
| Banco de dados | **PostgreSQL** (sugestão: **Neon**, plano gratuito) | o Render gratuito **não tem disco** (tudo se perde ao reiniciar), então as contas precisam de um banco externo |
| Login | e-mail + senha, no próprio servidor (senha protegida com *scrypt*) e, opcionalmente, **Google** | simples no celular; sem chaves privadas no aplicativo |
| Visitante | continua existindo | quem não quer conta joga como sempre |

O banco **só é ligado** se existir a variável `DATABASE_URL`. Sem ela o jogo é idêntico ao de antes (e o botão "Entrar" nem aparece).

## Passo 1 — Criar o banco gratuito (Neon)

1. Acesse **neon.com** e toque em **Sign up** (pode entrar com Google ou GitHub). Não pede cartão.
2. Crie um **projeto** (nome sugerido: `quebra-cabeca`). Em **Region**, escolha a mais próxima do seu Render (se o Render estiver em *Oregon/Ohio/Virginia*, escolha *US East*; se estiver em *Frankfurt*, escolha *Europe*).
3. Na tela do projeto, toque em **Connect** (ou *Connection details*). Deixe marcado **Pooled connection** e copie a linha que começa com `postgresql://` (é a **DATABASE_URL**). Ela contém uma senha: trate como segredo.

## Passo 2 — Colocar o endereço no Render

1. No Render, abra o seu serviço **quebra-apk** (ou o nome que você usa) > **Environment**.
2. **Add Environment Variable**: nome `DATABASE_URL`, valor = a linha copiada do Neon. **Save changes**.
3. (Opcional, Google) veja o Passo 6. Só depois, adicione também `GOOGLE_CLIENT_ID`.

## Passo 3 — Publicar o código no GitHub

Envie para o repositório (substituindo os que já existem):

- Raiz: `server.js`, `challenge.js`, `package.json`, `package-lock.json`, **`accounts.js`** (novo), **`db.js`** (novo), `README.md`, `CONTAS.md`, `render.yaml`.
- Pasta **`migrations/`** (nova) com `001_contas.sql`.
- Pasta `public/`: `index.html`, `style.css`, `game.js`, `sw.js`, **`conta.js`** (novo), **`privacidade.html`** (novo).
- (Opcional) pasta `scripts/` com `migrate.js`.

> No computador é só arrastar as pastas para o GitHub (**Add file > Upload files**). No celular o GitHub não aceita pastas: para a pasta nova use **Add file > Create new file**, digite `migrations/001_contas.sql` no nome (a barra cria a pasta), cole o conteúdo do arquivo e confirme.
> **Atenção:** `package.json` precisa ir junto, porque agora inclui o pacote `pg` (driver do banco).

O Render publica sozinho. Espere o status **Live**.

## Passo 4 — Conferir se ligou (migrações automáticas)

As tabelas são criadas **sozinhas** quando o servidor liga (não precisa rodar comando). Para conferir, abra no navegador:

`https://SEU-APP.onrender.com/diagnostico` — deve aparecer `"contas": { "ativas": true, ... "dica": "Contas funcionando." }`.

Se aparecer `ativas: false`, leia `dica`: normalmente a `DATABASE_URL` está errada ou faltou a pasta `migrations/`. Os detalhes ficam em **Logs** do Render (procure por `[contas]`).

## Passo 5 — Permissões e segurança (já feitas no código)

- O aplicativo **nunca fala direto com o banco**: só o servidor fala. Por isso não há "regras de acesso" para configurar no Neon.
- Cada rota só mexe nos dados de quem está logado. Busca de amigo: só pelo código exato. E-mail nunca é mostrado a outras pessoas.
- Se quiser reforço: no Neon, em **Settings > Roles**, você pode criar uma "role" só para o jogo (sem poder apagar o projeto). Opcional.

## Passo 6 (opcional) — Entrar com o Google

1. **console.cloud.google.com** > crie um projeto > **APIs e serviços > Tela de permissão OAuth** (tipo *Externo*, nome do app, e-mail de suporte).
2. **Credenciais > Criar credenciais > ID do cliente OAuth > Aplicativo da Web.**
3. Em **Origens JavaScript autorizadas** coloque `https://SEU-APP.onrender.com`. Salve.
4. Copie o **ID do cliente** (termina em `.apps.googleusercontent.com`) e coloque no Render como `GOOGLE_CLIENT_ID`. **Não precisa** do "segredo do cliente".
5. Aguarde o Render reiniciar: o botão "Continuar com o Google" aparece na tela de entrada.

Observações: contas Google de crianças (Family Link) podem ter restrições; o login por e-mail sempre fica disponível.
Os nomes dos botões do Google Cloud mudam de tempos em tempos.

## Passo 7 — Testar com dois celulares

1. Celular 1: abra o jogo > **Entrar** (canto superior direito) > **Criar conta** (apelido, e-mail, senha, caixa de privacidade).
2. Celular 2: faça o mesmo com outro e-mail.
3. Celular 1: **Perfil** mostra o *Meu código de amigo* (ex.: `K7QM-4TRD`). No celular 2, aba **Amigos**, digite esse código > **Procurar** > **Pedir amizade**.
4. Celular 1 recebe o aviso e aceita em **Amigos > Pedidos**. Os dois aparecem na lista um do outro (com bolinha verde quando online).
5. Celular 1: **Desafiar** > escolha o modo > escolha a imagem > **Criar e convidar**. O celular 2 recebe o convite na tela > **Aceitar**: os dois entram na mesma sala.
6. Salvamento: no modo cooperativo, encaixe 2 ou 3 peças, feche o app, abra de novo: aparece **Continuar jogando** na tela inicial.

## Como verificar os dados no banco

No Neon: **SQL Editor** e rode (somente leitura):

```sql
select name, friend_code, created_at from users order by created_at desc;      -- contas (sem mostrar senhas)
select count(*) from matches;                                                  -- partidas registradas
select user_id, pieces, jsonb_array_length(locked) as encaixadas from saves;  -- partidas salvas
select status, count(*) from invites group by status;                          -- convites
```

## Custos e limites (conferidos em outubro de 2026; podem mudar)

- **Neon gratuito:** permanente, sem cartão; **0,5 GB** de armazenamento e **100 horas de processamento por mês** por projeto. O banco "dorme" após ~5 min parado e acorda em ~1 s na próxima visita.
  Para centenas de jogadores, o espaço é suficiente (cada conta e cada partida ocupam poucos KB; só uma **partida salva com imagem própria** guarda até ~1,5 MB).
- **Render gratuito:** o servidor dorme sem uso (o primeiro acesso demora) e **acordar derruba as salas abertas**, como antes. As contas e o progresso salvo **não se perdem**, porque estão no banco.
- **Supabase** (alternativa): 500 MB, mas o projeto **pausa após 7 dias sem uso**; funciona do mesmo jeito (basta usar a *connection string* dele como `DATABASE_URL`).
- Nenhum serviço novo cobra se você ficar nos limites gratuitos.

## Regras claras para partidas competitivas (Sala Desafio)

- Queda de conexão: a pessoa tem **45 segundos** para voltar; passado o prazo, **perde** (o adversário vence).
- Sair da sala durante a disputa conta como **derrota** (e o outro ganha), sem tempo registrado.
- Uma disputa **encerrada nunca é retomada**: ao reabrir o app, o jogo começa limpo.
- "Continuar jogando" vale só para a **partida cooperativa** (a última inacabada). Recomeçar ou trocar a imagem apaga o progresso antigo.
- Convites: **pendente → aceito / recusado / expirado** (3 minutos). Aceitar duas vezes devolve a mesma sala; se a sala acabou ou encheu, o convite vira "expirado".

## Privacidade e crianças (leia)

- Guardamos o mínimo: e-mail (só para entrar), senha protegida, apelido, avatar, partidas, amigos e a última partida salva. Sem telefone, endereço, data de nascimento, localização ou bate-papo público.
- No cadastro há uma caixa: "li a política de privacidade; se tenho menos de 18 anos, um responsável me autorizou".
- **Faça agora:** edite `public/privacidade.html` e troque `[PREENCHER: ...]` pelo seu e-mail de contato.
- Há **exclusão de conta** em *Perfil > Excluir minha conta* (apaga tudo).
- Este material **não é aconselhamento jurídico**. Como o jogo é voltado ao público infantil, vale conferir com um profissional as obrigações da **LGPD (art. 14)** antes de divulgar amplamente.

## O que ainda não existe

- **Recuperar senha por e-mail** (precisa de um serviço de envio de e-mails). Por enquanto, quem esquecer a senha cria outra conta ou entra pelo Google.
- Bate-papo entre amigos, perfis públicos e ranking (de propósito, nesta etapa).
