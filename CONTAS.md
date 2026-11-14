# Perfil gerado pelo jogo (ID + código-chave) — guia de configuração e regras

> Desde a etapa "perfil gerado", **não existe mais conta por e-mail, senha, Google, lista de amigos nem convites**. Cada pessoa tem um **perfil criado pelo próprio jogo**, identificado por um **ID público** e protegido por um **código-chave** que só aparece uma vez.
> Nunca cole a `DATABASE_URL` nem códigos-chave no GitHub, em conversas ou em prints.

## O que existe e por quê

| Peça | Escolha | Por quê |
|---|---|---|
| Servidor | Node/Express/Socket.IO (Render) | o tempo real das salas privadas já usa o Socket.IO |
| Banco de dados | **PostgreSQL** (Neon, plano gratuito) | o Render gratuito não tem disco; o perfil e o progresso precisam de um banco externo |
| Identidade | **ID** de 8 caracteres (ex.: `K7QM-4TRD`, **não é segredo**) + **código-chave** de 20 caracteres (ex.: `ABCDE-FGHJK-MNPQR-STUVW`, **segredo**) | não pedimos nome, e-mail, telefone nem senha: menos dados pessoais para proteger |
| Apelido | sorteado pelo jogo (Animal + Cor, ex.: "Garça Amarelo"); a pessoa só pode **sortear outro**, não digitar | evita nomes reais e ofensas |
| Nas salas | sempre "Jogador 1" e "Jogador 2" | a outra pessoa nunca vê apelido, ID, nível, gemas, pet ou roupas |
| Visitante | continua existindo | quem não quer perfil joga como sempre (nada fica no servidor) |

O banco **só é ligado** se existir a variável `DATABASE_URL`. Sem ela o jogo funciona como visitante e a opção de perfil não aparece.

## Como o código-chave é protegido

- Gerado no servidor com 20 símbolos de um alfabeto de 31 (sem I, L, O, 0, 1), ou seja, cerca de 99 bits de aleatoriedade (`crypto.randomInt`).
- **Aparece uma única vez**, na resposta da criação (e quando a pessoa gera um código novo). O banco guarda só `scrypt$salt$hash` (`users.secret_hash`); o código não vai para log, não fica no aparelho e não pode ser lido por ninguém.
- **Quem perde o código perde o perfil**: não há e-mail para recuperar. Gerar um **código novo** exige o código atual; o antigo deixa de valer na hora e as sessões de outros aparelhos são encerradas.
- Login por ID + código com resposta **igual** para "ID inexistente" e "código errado" (e tempo parecido, com um hash de mentira), limite de tentativas por ID (8) e por endereço (20) a cada 15 minutos, e limite de criação de perfis por endereço (6 por hora).
- Sessão: token aleatório, só o hash SHA-256 fica no banco, vale 60 dias; "Sair" apaga a sessão; "Sair de todos os aparelhos" apaga todas e derruba os sockets.

## Passo 1 — Criar o banco gratuito (Neon)

1. Acesse **neon.com** e toque em **Sign up**. Não pede cartão.
2. Crie um **projeto** (nome sugerido: `quebra-cabeca`). Em **Region**, escolha a mais próxima do seu Render.
3. Em **Connect**, deixe marcado **Pooled connection** e copie a linha que começa com `postgresql://` (é a **DATABASE_URL**). Ela contém senha: trate como segredo.

## Passo 2 — Colocar o endereço no Render

1. No Render, abra o seu serviço > **Environment**.
2. **Add Environment Variable**: nome `DATABASE_URL`, valor = a linha copiada do Neon. **Save changes**.
3. Variáveis úteis (todas opcionais): `CSP_MODE` (`report` por padrão; troque para `enforce` depois de testar no celular), `ACC_RATE_MULT` (multiplicador dos limites; deixe vazio em produção), `CHAT_ENABLED` e `PUSH_ENABLED` (hoje `false`).

## Passo 3 — Publicar o código

Siga o fluxo de sempre: ramificação nova no GitHub, subir os arquivos do pacote mantendo as pastas, abrir o Pull request, **Merge** e, no Render, **Manual Deploy**. A migração `018_perfil_gerado.sql` roda **sozinha** quando o servidor liga e **não apaga nada** (ver `docs/MIGRACAO_E_ROLLBACK.md`).

## Passo 4 — Conferir se ligou

Abra `https://SEU-APP.onrender.com/diagnostico?token=SEU_TOKEN` (crie antes a variável `DIAG_TOKEN` no Render; ver `SEGURANCA.md`, seção 0). Deve aparecer `"contas": { "ativas": true, ... }` e `login_por_codigo_chave`. Se aparecer `ativas: false`, leia `dica`; os detalhes ficam em **Logs** (procure `[contas]`).

## Passo 5 — Perfis antigos (e-mail/Google)

Perfis criados antes desta etapa ficam no banco com `kind = 'legado'` e **não conseguem mais entrar** (não há login por e-mail). Para listar e, só se você decidir, apagar: `node scripts/apaga-contas-antigas.js` (apenas lista) e `node scripts/apaga-contas-antigas.js --apagar --confirmo` (apaga de verdade, em cascata). Faça um backup do Neon antes.

## Passo 6 — Testar com dois celulares

1. Celular 1: **Entrar** > **Criar perfil** > marque as duas caixas (privacidade e 16 anos) > **Criar**. Anote o **ID** e o **código-chave**, marque "anotei" e toque **Começar a jogar**.
2. Em **Perfil**: **Sortear outro apelido**; **Gerar código novo** (confira que o antigo não entra mais); **Sair**; **Entrar** com ID + código novo.
3. Celular 1 cria uma sala (cooperativo ou Desafio) e mostra o código da sala; celular 2 entra com o código. Nos dois aparece só "Jogador 1/2".
4. Tente uma terceira pessoa na mesma sala: deve ser recusada.
5. Em **Apagar meus dados…**: código errado é recusado; código certo apaga e desloga.

## Regras claras para partidas competitivas (Sala Desafio)

- Queda de conexão: **45 segundos** para voltar; passado o prazo, perde (o adversário vence).
- Sair da sala durante a disputa conta como **derrota**, sem tempo registrado.
- Uma disputa **encerrada nunca é retomada**.
- "Continuar jogando" vale só para a **partida cooperativa** (a última inacabada).

## Público: não indicado para menores de 16 anos, privacidade e denúncias

- **O jogo não é indicado para menores de 16 anos.** Ao abrir o app, uma **tela de idade neutra** pede mês e ano de nascimento (guardados só no aparelho, nunca enviados). Quem informa menos de 16 anos não joga e, se havia perfil neste aparelho, ele é apagado no servidor. Para criar o perfil há duas caixas: privacidade ("se tenho menos de 18 anos, um responsável me autorizou") e idade (**"tenho 16 anos ou mais"**). O servidor recusa a criação sem as duas.
- Guardamos o mínimo: apelido sorteado, avatar, hash do código-chave, partidas, XP, gemas, conquistas, coleções, loja/pet e a última partida salva. Sem e-mail, telefone, endereço, localização ou bate-papo livre.
- **Política de privacidade:** `public/privacidade.html`. **Exclusão:** no app (*Perfil > Apagar meus dados…*) e em `public/excluir-conta.html` (o endereço que a Play Store pede).
- **Denúncia:** no menu da partida. Vai para a tabela `reports` (ver `SEGURANCA.md`, seção 12). Para um ID inexistente a resposta é a mesma de um ID real.
- **Divulgação:** nada do jogo, do texto da loja ou das imagens deve parecer feito para crianças pequenas.
- **Cuidado jurídico (importante):** este material **não é aconselhamento jurídico**. O **ECA Digital** (Lei 15.211/2025) vale para serviços "de acesso provável" por menores de 18 anos. Tirar amigos, convites e nomes reais reduz a exposição, mas **confirme com um profissional** o enquadramento antes de divulgar amplamente. Veja `docs/CONTROLES_LGPD_ECA.md`.

## O que não existe (de propósito)

- Recuperar perfil por e-mail, login com Google, lista de amigos, convites, perfis públicos, ranking e bate-papo livre.
