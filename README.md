# 🧩 Quebra-Cabeça a Dois

Jogo de quebra-cabeça cooperativo online: duas pessoas, cada uma no seu celular (ou computador), montam **a mesma imagem ao mesmo tempo**, vendo os movimentos uma da outra em tempo real.

- Feito para **celular** (toque, tela em pé), mas funciona também no computador.
- **Tabuleiro grande**: ele ocupa quase toda a largura da tela, e não há barras ocupando espaço embaixo. Só o topo tem um cabeçalho pequeno.
- **Gestos simples nas peças:** arrastar, tocar para girar e pinça para dar zoom.
- **Tutorial animado** na primeira vez, **avatares**, **modo escuro**, **texto maior**, **sons** e **marcos de progresso** (25%, 50% e 75%).
- **Dica de lugar 📍**, **recomeçar só com a confirmação do amigo** e **avisos com o aplicativo fechado** (opcionais).
- **Conversa entre os dois jogadores:** um botão 💬 no topo abre um painel por cima do jogo (sem tirar espaço do tabuleiro), com mensagens de texto e reações rápidas.
- Não precisa instalar nada no seu computador: tudo é feito pelos sites do **GitHub** e do **Render**.
- Cada jogador digita o **próprio nome**; a pessoa que cria escolhe a **imagem** e a **quantidade de peças**.
- O código da sala é **gerado automaticamente** e o amigo entra digitando esse código de 4 caracteres.

---

## Como o jogo funciona

1. Quem cria a partida digita o **nome** (e, se quiser, escolhe um **avatar**), toca em **Criar partida**, escolhe a **imagem** e a **quantidade de peças** (6, 12, 20, 30 ou 48) e o jogo gera a sala com um código de 4 caracteres (ex.: `K7MQ`).
2. Enquanto o amigo não entra, aparece no topo uma **faixa fina só com o código da sala**. Passe esse código ao amigo (por WhatsApp, ligação, o que preferir). Quando o amigo entra, a faixa some e o tabuleiro ganha mais espaço.
3. O amigo abre o jogo, **digita o nome dele e o código** em *Entrar com código* e toca em **Entrar**. O nome de cada um aparece no topo e nas peças que a pessoa estiver segurando.
4. As peças começam **embaralhadas e giradas** na bandeja, embaixo do tabuleiro. Na bandeja elas ficam **pequenas** (para sobrar espaço para o tabuleiro) e **crescem até o tamanho cheio quando você as arrasta**.
5. **Arrastar:** segure a peça com o dedo e arraste até o tabuleiro. Ao soltar perto do lugar certo (e com a peça na posição certa), ela **encaixa e trava**. Uma peça solta fora da bandeja continua no tamanho cheio; se você a devolver para a bandeja, ela volta a ficar pequena.
6. **Girar:** toque na peça para **escolhê-la** (ela ganha um contorno colorido e uma etiqueta **↻ 3**, que mostra quantos giros ainda restam) e **toque nela de novo** para girar 90°. Tocar duas vezes seguidas também funciona: escolhe e gira. Cada peça aceita **até 3 giros** por vez; depois disso toque num espaço vazio para soltá-la (os giros são renovados).
7. **Zoom:** com a peça escolhida, faça o **movimento de pinça** com dois dedos para ampliá-la e ver os detalhes (e feche a pinça para reduzir). O zoom aparece só na sua tela, a peça ampliada sempre fica inteira dentro da tela, e ele acaba quando a peça é solta. No computador, use a roda do mouse.
8. **Soltar:** toque num espaço vazio, ou arraste a peça e solte. Uma peça escolhida e esquecida é solta sozinha depois de 20 segundos, para o amigo poder usá-la.
9. O **triângulo ▲** desenhado em cada peça mostra qual lado é o "de cima". Ajuda muito nas peças brancas ou de uma cor só: a peça está na posição certa quando o ▲ aponta para cima.
10. **Exclusividade:** enquanto uma pessoa segura uma peça (contorno colorido e etiqueta com o nome dela), a outra **não consegue** pegá-la, movê-la nem girá-la.
11. **💡 Lâmpada:** fica no topo, ao lado do menu, e é só o ícone. Ao apertar, a **imagem completa aparece esmaecida no tabuleiro, atrás das peças, por 4 segundos** e depois some sozinha. Cada jogador pode usar **10 vezes por partida** (o número pequeno no botão mostra quantas restam). Apertar de novo enquanto a imagem está visível não gasta outra dica, e só quem apertou vê a imagem. Recarregar a página não renova as dicas.
12. **📍 Dica de lugar:** com uma peça **escolhida**, o mesmo botão vira **📍**. Ao apertar, a **casa certa da peça pisca no tabuleiro por cerca de 4 segundos**. É só um destaque: a peça não se mexe sozinha. São **5 usos por jogador** por partida (o número no botão mostra quantos restam), e só quem apertou vê o destaque. Se a peça já estiver no lugar, o jogo avisa e não gasta o uso.
13. **💬 Conversa:** toque no balão 💬 no topo para abrir o painel. Escreva e toque em **Enviar** (ou use o Enter), ou toque numa reação rápida (👍 😂 👏 😮 🤔 ❤️ 🎉). Com o painel fechado, quando o amigo escrever aparece um **aviso no topo** com a mensagem e um **contador** no botão 💬. Toque no aviso para abrir. Quem entra depois, ou volta à sala, vê as últimas mensagens.
14. **Marcos e sons:** ao chegar a **25%, 50% e 75%** das peças encaixadas aparece uma mensagem curta ("Um quarto!", "Metade!", "Falta pouco!"). Há sons curtos ao encaixar, ao vencer, ao chegar mensagem e ao chegar um pedido de recomeçar. Eles são gerados pelo próprio navegador, e o **botão de silêncio** fica no Menu (☰) e em Ajustes.
15. **Vitória:** aparece a **imagem completa** (sem nenhuma linha de grade), o **tempo**, quantas peças cada um encaixou (com avatar e nome) e o seu **melhor tempo** para aquela imagem e quantidade de peças (aparece "🏆 Novo recorde!" quando você bate o seu melhor). Os botões **⬇ Salvar imagem** e **↗ Compartilhar** geram uma figura com a imagem pronta e uma faixa com os nomes, a quantidade de peças e o tempo. Se o aparelho não permitir compartilhar direto, a imagem é salva para você enviar.
16. **Recomeçar com a confirmação do amigo:** "Jogar de novo", "Recomeçar esta imagem" e "Trocar imagem ou peças" **pedem o aceite do outro jogador**. Ele vê "Fulano quer recomeçar" (com a imagem e a quantidade de peças) e pode **Aceitar** ou dizer **Agora não**, e tem **30 segundos** para responder. Quem pediu vê "Esperando…" e pode **Cancelar**. Se o amigo não estiver na sala, recomeça na hora. Assim ninguém perde a partida sem querer.

O menu (☰) tem **Como jogar** (o tutorial animado), **Ajustes**, o **botão de silêncio**, trocar a imagem ou a quantidade de peças, recomeçar e sair. Ao começar uma partida nova, as dicas voltam a 10 (💡) e 5 (📍) para cada um.

---

## Conversa (chat)

- **Como funciona:** as mensagens passam pelo mesmo servidor do jogo e chegam na hora aos dois da sala. Cada mensagem mostra o nome de quem escreveu, com a cor do jogador.
- **Limites:** até 200 letras por mensagem e um ritmo máximo de 20 mensagens a cada 10 segundos por pessoa (para evitar enchentes). Mensagens em branco não são enviadas.
- **Só texto:** nada do que for digitado vira link, imagem ou código; aparece exatamente como foi escrito.
- **Histórico:** o servidor guarda só as **últimas 50 mensagens da sala**, na memória, para quem voltar à sala. Elas somem quando a sala é apagada (cerca de 15 minutos depois de todos saírem) ou quando o Render reinicia o serviço. **Nada é gravado em arquivo e as mensagens não aparecem no registro (log) do servidor.** Reiniciar a partida não apaga a conversa.
- **Teclado do celular:** ao tocar no campo de texto, o painel sobe junto com o teclado para o campo não ficar escondido.
- **Não precisa gerar outro APK:** o aplicativo carrega o jogo do site, então a conversa aparece sozinha depois que você atualizar o GitHub.
- **Moderação:** não há filtro de palavras. Se o jogo for usado com crianças ou alunos, vale combinar regras antes ou **desligar a conversa**:
  1. No Render, abra o serviço e vá em **Environment**.
  2. Clique em **Add Environment Variable**, use o nome `CHAT_ENABLED` e o valor `false`, e salve.
  3. O Render publica de novo e o botão 💬 deixa de aparecer. Para ligar de novo, apague a variável ou troque o valor por `true`.

---

## Tutorial, avatares e o que o jogo guarda no seu aparelho

- **Tutorial:** abre sozinho na **primeira partida de cada aparelho**, com 4 passos animados: **arrastar**, **girar tocando de novo na peça**, **pinça (zoom)** e as **ajudas** (💡, 📍, 💬, 🔔). Avança sozinho a cada 5 segundos, ou use *Próximo*, ‹ e as bolinhas. Para rever: **Menu (☰) > Como jogar** ou o link **Como jogar** na tela inicial. Se o celular estiver com "reduzir movimento", as cenas ficam paradas.
- **Avatar:** na tela inicial escolha a **inicial do seu nome** ou um dos **14 emojis**. No cabeçalho aparece um círculo na cor do jogador (azul ou rosa) com a inicial ou o emoji, e o círculo do jogador 2 tem um contorno tracejado, para o jogo não depender só da cor. Tocar no círculo mostra o nome. O avatar também aparece nas etiquetas das peças, no chat e na vitória.
- **O que fica guardado só neste aparelho** (não vai para o servidor, exceto o nome e o avatar que você usa na sala): seu **nome**, seu **avatar**, os **Ajustes**, os **melhores tempos** e se você **já viu o tutorial**. Para apagar, limpe os dados do site/aplicativo nas configurações do celular.
- **Entrar direto:** como o nome fica guardado, abrir o endereço da sala (por exemplo, tocando em um aviso) leva **direto para o jogo**, sem pedir o nome de novo.

---

## Ajustes e acessibilidade

Abra em **Menu (☰) > Ajustes** (ou **⚙ Ajustes** na tela inicial):

- **Tamanho do texto:** A, A+ ou A++ (as janelas rolam se o texto grande não couber).
- **Aparência:** *Automática* (segue o celular), *Clara* ou *Escura*. A escolha vale antes mesmo de a tela aparecer, sem piscar branco.
- **Movimento:** *Automático* (segue a opção "reduzir movimento" do celular) ou *Reduzido* (sem animações longas, sem confete; o tutorial fica parado).
- **Sons** e **Vibração:** liga e desliga.
- **🔔 Avisos com o app fechado:** veja a seção abaixo.

Para leitores de tela: as peças, o progresso, as janelas e os avisos importantes (peça encaixada, amigo entrou, mensagem nova, pedido para recomeçar, marcos e vitória) têm descrições e anúncios. O foco do teclado vai para o botão certo ao abrir uma janela e volta ao botão de origem ao fechar, e a tecla **Esc** fecha Menu, Ajustes e tutorial. As cores dos textos foram conferidas para ter contraste de pelo menos 4,5:1 nos dois temas.

---

## Avisos com o aplicativo fechado (opcional)

Com os avisos ligados, o aparelho mostra uma notificação quando **o amigo entra na sala** que você criou ou **escreve uma mensagem** e o jogo **não está aberto**.

- **Como ligar:** *Menu > Ajustes > 🔔 Avisos com o app fechado*, ou o botão **🔔 Ativar avisos** no último passo do tutorial. O celular pede permissão para mostrar notificações.
- **Só funciona dentro da sala:** o servidor guarda o "endereço" do aviso do seu aparelho **na memória da sala**, junto com os dois jogadores. Quando a sala acaba, ou o Render reinicia o serviço, esse endereço some, e o jogo o registra de novo na próxima vez que você entrar numa sala.
- **O que chega:** "*Fulano* entrou na sala. Bora jogar?" e a mensagem do amigo (até 90 letras, no máximo uma a cada 8 segundos). Tocar no aviso abre o jogo na sala certa (ou só traz o jogo para a frente, se ele já estiver aberto).
- **Privacidade:** o texto do aviso viaja criptografado pelo serviço de notificações do navegador (no Android, o do Google), que não consegue lê-lo. O servidor do jogo só envia para serviços de notificação conhecidos.
- **No aplicativo (APK):** a permissão de notificações precisa estar liberada para o aplicativo (e as notificações ligadas quando o APK foi gerado no PWABuilder). Se o pedido de permissão não aparecer no aplicativo, libere em *Configurações do celular > Aplicativos > Quebra-Cabeça > Notificações*, ou ative no Chrome.
- **No iPhone:** só funciona depois de adicionar o jogo à tela de início (Safari > Compartilhar > Adicionar à Tela de Início), e em versões recentes do iOS.
- **Desligar para todos:** no Render, em **Environment**, crie `PUSH_ENABLED` com o valor `false`.
- **Chaves fixas (opcional):** por padrão o servidor cria as chaves de aviso quando liga. Isso funciona bem, porque as inscrições valem só enquanto a sala existe. Se quiser fixá-las, crie no Render `VAPID_PUBLIC_KEY` e `VAPID_PRIVATE_KEY` (pode gerá-las com a biblioteca `web-push`). Use `VAPID_SUBJECT` para colocar um e-mail de contato (`mailto:voce@exemplo.com`).

---

## Quantidade de peças

| Peças | Grade | Nível | Tabuleiro na tela* | Peça montada* | Peça na bandeja* |
|---|---|---|---|---|---|
| 6 | 2 × 3 | Bem fácil | ~320 px | ~160 px | ~92 px |
| 12 | 3 × 4 | Fácil | ~365 px | ~120 px | ~61 px |
| 20 | 4 × 5 | Médio | ~365 px | ~90 px | ~52 px |
| 30 | 5 × 6 | Difícil | ~365 px | ~73 px | ~46 px |
| 48 | 6 × 8 | Desafio | ~300 px | ~50 px | ~42 px (pequena; melhor em tela grande) |

\* Em um celular de 390 × 844 px, com o aparelho em pé. Para comparar: antes das últimas melhorias, com 12 peças, o tabuleiro tinha cerca de 227 px e cada peça montada, 75 px. Com a pinça você amplia qualquer peça escolhida para ver os detalhes.

As peças são sempre quadradas. Como cada grade tem uma proporção um pouco diferente (por exemplo, 4 × 5 é mais "quadrada" que 3 × 4), o jogo **recorta o centro da imagem** para encaixar. Com imagens em pé 3:4 (como as incluídas), o recorte é de apenas 6% a 11% nas bordas. A lâmpada 💡 e o tabuleiro sempre mostram a imagem já recortada, exatamente como será montada.

---

## Estrutura do projeto

```
quebra-cabeca/
├── package.json          dependências e comando de início (npm start)
├── server.js             servidor (Express + Socket.IO): regras e sincronização
├── render.yaml           (opcional) configuração pronta para o Render
├── .gitignore
├── README.md
└── public/
    ├── index.html        telas do jogo
    ├── style.css         visual
    ├── game.js           lógica do jogo no navegador
    ├── manifest.webmanifest  dados do aplicativo (nome, ícones, cores)
    ├── sw.js             deixa o jogo instalável como aplicativo
    ├── assetlinks.json   (só para o APK) verificação do Android; cole aqui o arquivo do PWABuilder
    ├── icons/            ícones do aplicativo (192, 512, recortável e iPhone)
    └── imagens/
        ├── angel.jpg
        ├── batman.jpg
        ├── jesus.jpg
        ├── stitch-e-angel.jpg
        └── stitch.jpg
```

---

## Passo 1 — Suas imagens

O projeto já vem com as **5 imagens** que você enviou, convertidas para JPG (mais leves, de 100 a 190 KB cada, sem perda visível de qualidade).

Para trocar ou acrescentar imagens, mexa na pasta `public/imagens/`:

- O jogo mostra **todas** as imagens `.jpg`, `.jpeg`, `.png` ou `.webp` da pasta (até 12). Não precisa mudar nenhum código.
- O nome do arquivo vira o rótulo na tela: `stitch-e-angel.jpg` → "Stitch e Angel".
- **Não funcionam:** GIF, SVG, HEIC (foto do iPhone) e AVIF. Converta para JPG ou PNG.

**Dicas para ficar leve e bonito:**

- Formato ideal: **em pé (3:4)**, por exemplo **900 × 1200 pixels**.
- Arquivo de preferência **abaixo de 500 KB**. Se estiver em PNG e pesado, salve como JPG.
- Imagens com **fundo branco** funcionam (o tabuleiro tem um tom lilás e cada peça tem borda para você enxergar onde estão), mas a montagem fica mais difícil nas partes só brancas. Para essas peças, use o triângulo ▲ para saber qual lado é o de cima.

---

## Passo 2 — Envie o projeto para o GitHub (pelo site)

> **Importante:** o GitHub **guarda** o código, mas **não executa** o servidor do jogo (o GitHub Pages só serve páginas simples). Quem coloca o jogo no ar é o **Render**, no Passo 3, lendo o código direto do seu repositório.

1. Entre em <https://github.com> e faça login (ou crie uma conta gratuita).
2. Clique no **+** no canto superior direito → **New repository**.
3. Em *Repository name* escreva, por exemplo, `quebra-cabeca`. Deixe **Public** (ou Private, funciona nos dois) e clique em **Create repository**.
4. Na página do repositório vazio, clique em **uploading an existing file** (ou *Add file → Upload files*).
5. **Descompacte** o `.zip` do projeto no seu aparelho e **arraste o conteúdo da pasta `quebra-cabeca`** (os arquivos `server.js`, `package.json`, `README.md`, `render.yaml`, `.gitignore` e a pasta `public`) para a área de upload.
   - Os arquivos precisam ficar **na raiz** do repositório (`server.js` e `package.json` logo na primeira página, não dentro de outra pasta).
   - A pasta `public` (com `imagens` dentro) precisa subir **junto**. Se o seu navegador não aceitar arrastar pastas, use *Add file → Create new file*, digite o caminho no nome (por exemplo `public/index.html`) e cole o conteúdo; as imagens você envia pelo *Upload files* dentro da pasta `public/imagens`.
6. Role até o fim e clique em **Commit changes**.

Confira: no repositório você deve ver `server.js`, `package.json` e a pasta `public` na primeira tela.

---

## Passo 3 — Coloque o jogo no ar no Render (grátis)

1. Entre em <https://render.com> e crie uma conta (pode usar o login do GitHub).
2. Clique em **New +** → **Web Service**.
3. Escolha **Build and deploy from a Git repository** e conecte sua conta do GitHub (autorize o acesso ao repositório `quebra-cabeca`).
4. Selecione o repositório e clique em **Connect**.
5. Preencha:

   | Campo | Valor |
   |---|---|
   | **Name** | `quebra-cabeca` (vira parte do endereço) |
   | **Region** | a mais próxima (ex.: *Ohio* ou *Virginia*) |
   | **Branch** | `main` |
   | **Runtime / Language** | `Node` |
   | **Build Command** | `npm install` |
   | **Start Command** | `npm start` |
   | **Instance Type** | `Free` |

6. (Opcional) Em *Advanced* → **Health Check Path**: `/health`.
7. Clique em **Create Web Service** e aguarde o *deploy* (1 a 3 minutos). Quando aparecer **Live**, o endereço estará no topo da página do serviço, algo como `https://quebra-cabeca.onrender.com`.

> **Alternativa mais rápida:** o projeto traz um `render.yaml`. No Render, use **New + → Blueprint**, escolha o repositório e confirme. Ele preenche tudo acima sozinho.

---

## Atualizando um jogo que já está no ar

Se você já publicou uma versão anterior, não precisa refazer nada no Render:

1. No GitHub, abra o repositório → **Add file → Upload files**.
2. Arraste os arquivos novos **com o mesmo nome**: na raiz, `server.js`, `package.json`, `package-lock.json` e `README.md`; e, dentro de `public`, `index.html`, `style.css`, `game.js` e `sw.js` (só se for a primeira vez com o aplicativo, também `manifest.webmanifest`, `assetlinks.json` e a pasta `icons`). **Envie também o `package.json` e o `package-lock.json`**: eles incluem a biblioteca dos avisos (`web-push`), que o Render instala sozinho. **Não substitua o seu `public/assetlinks.json` se ele já tem o conteúdo do APK.** Eles substituem os antigos. Para a pasta `public`, arraste o conteúdo mantendo a estrutura (ou entre na pasta `public` do repositório antes de enviar os três arquivos de dentro dela).
3. Entre em `public/imagens`, **apague** as imagens antigas (`imagem1.jpg` a `imagem4.jpg`: abra cada arquivo, ícone de lixeira → *Commit changes*) e envie as novas.
4. Clique em **Commit changes**. O Render percebe a mudança e publica sozinho em 1 a 3 minutos (status *Deploying* → *Live*).
5. Recarregue o jogo no celular. Se ainda aparecer a versão antiga, feche a aba e abra de novo.

---

## Passo 4 — Jogar

1. Abra o endereço do Render no celular.
2. Digite o **seu nome**, toque em **Criar partida**, escolha a imagem e a quantidade de peças e toque em **Criar partida** de novo.
3. Passe ao amigo o **código de 4 caracteres** que aparece na faixa do topo (por WhatsApp, ligação, o que preferir).
4. O amigo abre o endereço do jogo, digita o nome dele e o código em *Entrar com código* e toca em **Entrar**. O relógio começa quando os dois estão na sala.

---

## Como testar

### Antes de chamar o amigo (sem instalar nada)

Depois de publicado no Render:

1. No computador, abra o endereço do jogo em **duas abas** (ou uma aba normal e uma anônima).
2. Na primeira aba, digite um nome e crie a partida. Copie o código.
3. Na segunda aba, digite outro nome e o código em **Entrar com código**.
4. Mova uma peça numa aba e veja se ela se mexe na outra, com a etiqueta do nome. Tente pegar, na segunda aba, uma peça que a primeira está segurando: o jogo deve avisar.
5. Aperte a lâmpada 💡: a imagem deve aparecer esmaecida atrás das peças, no tabuleiro, e sumir sozinha depois de 4 segundos. O número no botão cai de 10 para 9 (só na tela de quem apertou).
6. Arraste uma peça da bandeja: ela deve crescer enquanto você a move e voltar a ficar pequena se você a soltar de volta na bandeja.
7. Toque numa peça (ela fica escolhida, com a etiqueta **↻ 3**) e toque de novo: ela deve girar e a etiqueta mudar para **↻ 2**.
8. No celular, com a peça escolhida, faça a pinça com dois dedos: a peça deve ampliar e continuar inteira na tela. No computador, use a roda do mouse.
9. Com uma peça escolhida, o botão da lâmpada vira **📍**: aperte e veja a casa certa piscar no tabuleiro.
10. Encaixe 25%, 50% e 75% das peças e veja as mensagens de marco. Abra o Menu (☰) e confira o botão de silêncio dos sons.
11. Peça para **recomeçar** numa aba: a outra deve mostrar o pedido para aceitar ou recusar (e vencer em 30 segundos).
12. Termine uma partida: confira a imagem completa, o recorde, **Salvar imagem** e **Compartilhar**.
13. Em **Ajustes**, teste o texto A++ e a aparência escura nas telas principais.

### No celular

1. Abra o endereço no celular e crie a partida.
2. No computador (ou em outro celular), entre com o código da sala.
3. Teste: arrastar com o dedo, tocar para escolher e tocar de novo para girar, a pinça (zoom), encaixar, a lâmpada, bloquear e desbloquear a tela (o jogo reconecta sozinho) e terminar o quebra-cabeça.
4. Experimente 6, 12 e 20 peças. Se for jogar com 30 ou 48, confira se o tamanho das peças está confortável para o seu dedo.

### No seu computador, se um dia tiver o Node.js instalado (opcional)

```
npm install
npm start
```

Abra `http://localhost:3000` em duas abas e siga o mesmo teste acima.

---

## Transformar em aplicativo (instalar no celular e gerar o APK)

O jogo já vem preparado para virar aplicativo (tem manifesto, ícones e service worker). Há dois caminhos. **Comece pelo A**: ele não exige nada além do link.

### Caminho A: instalar pelo navegador (sem APK, 1 minuto)

- **Android (Chrome):** abra o link do jogo, toque nos três pontinhos **⋮** e em **Instalar app** (ou **Adicionar à tela inicial**) e confirme. O ícone aparece na tela e o jogo abre em tela cheia, sem a barra do navegador.
- **iPhone (Safari):** toque em **Compartilhar** e em **Adicionar à Tela de Início**. O iPhone não aceita APK; este é o único caminho nele.

### Caminho B: gerar o APK (arquivo para baixar e instalar no Android)

Tudo é feito no site **PWABuilder** (pwabuilder.com): é gratuito, funciona no navegador, não pede conta e não precisa instalar nada.

**Antes de começar:** o jogo precisa estar publicado no Render com os arquivos desta versão. Confirme abrindo `SEU-LINK/manifest.webmanifest` (deve aparecer um texto com o nome do jogo) e abra o jogo uma vez para o Render "acordar".

1. Entre em **pwabuilder.com**, cole o link do seu jogo (`https://SEU-SERVICO.onrender.com`) e clique em **Start**. Espere a análise: o Manifesto e o Service Worker devem aparecer como aprovados.
2. Clique em **Package for stores** e escolha **Android**.
3. Preencha:
   - **Package ID:** um nome único em minúsculas, sem espaços nem acentos, como `com.seunome.quebracabeca`. Ele é permanente: anote.
   - **App name:** `Quebra-Cabeça a Dois`. **Versão:** `1`.
   - **Signing key:** deixe em **New** (o site cria a chave de assinatura).
   - Em *All settings*, confira que o modo de exibição é **Standalone** (as demais opções podem ficar como estão).
4. Clique em **Download package**. O site entrega um `.zip` (a tela pode estar um pouco diferente do que descrevo, mas o caminho é este).
5. **Descompacte o zip.** Dentro estão o arquivo **.apk**, o arquivo da **chave de assinatura** e o `signing-key-info.txt` (com a senha e a impressão digital SHA-256). **Guarde esses arquivos em lugar seguro**: sem a chave, você não consegue gerar atualizações do mesmo aplicativo depois.
6. **Para o aplicativo abrir sem a barra de endereço** (verificação do Android):
   - Abra o `assetlinks.json` que veio no zip (ou use o modelo abaixo) e copie **todo o conteúdo**.
   - No GitHub, abra `public/assetlinks.json`, clique no lápis, apague o `[]`, cole o conteúdo e clique em **Commit changes**. (Se preferir não mexer no GitHub: no Render, abra o serviço, vá em **Environment**, clique em **Add Environment Variable**, use o nome `ASSETLINKS_JSON`, cole o conteúdo como valor e salve.)
   - Quando o Render marcar **Live**, abra `SEU-LINK/diagnostico`: em `verificacao_do_aplicativo` devem aparecer o seu pacote e a impressão digital. Abra também `SEU-LINK/.well-known/assetlinks.json`: deve mostrar o mesmo conteúdo.
   - O servidor aceita o arquivo em `public/assetlinks.json`, `public/.well-known/assetlinks.json`, na raiz ou em `.well-known/` na raiz; vale o primeiro que tiver conteúdo.
7. **Instale no celular:** envie o `.apk` para o aparelho (WhatsApp, Google Drive, e-mail ou cabo) e toque nele. Se o Android pedir, permita **instalar apps desconhecidos** para o aplicativo que você usou para abrir o arquivo (Chrome, WhatsApp, Arquivos) e toque em **Instalar**. O aviso do Google Play Protect de "app não verificado" é normal para um APK que não vem da loja.
8. **Para os amigos:** mande o mesmo `.apk`; cada um instala do mesmo jeito.

Modelo do `assetlinks.json` (troque o nome do pacote e a impressão digital pelos do seu `signing-key-info.txt`):

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "com.seunome.quebracabeca",
      "sha256_cert_fingerprints": ["AA:BB:CC:...:ZZ"]
    }
  }
]
```

**O que esperar do aplicativo**

- Ele é uma "moldura" do jogo online: **precisa de internet**. Sem internet, abre a tela inicial com o aviso "Sem conexão com o servidor".
- **Atualizações do jogo aparecem sozinhas:** quando você atualiza o GitHub e o Render publica, o aplicativo mostra a versão nova na próxima abertura, sem reinstalar o APK. Só é preciso gerar um APK novo se o endereço do Render mudar.
- A primeira abertura pode demorar (plano gratuito do Render dorme depois de uns 15 minutos sem uso).
- Se aparecer uma **barra de endereço no topo** do aplicativo, faltou o passo 6 ou o nome do pacote/impressão digital no `assetlinks.json` não bate com o do APK. Corrija, feche e abra o aplicativo (se persistir, desinstale e instale de novo).
- Para publicar na **Play Store** é preciso uma conta de desenvolvedor paga e seguir as regras da loja. Atenção: as imagens de personagens (Stitch, Batman etc.) têm direitos autorais; para uso privado entre amigos tudo bem, mas uma publicação pública pode ser recusada. Use imagens suas ou liberadas se um dia for publicar.

---

## Se algo não funcionar

- **A primeira abertura demora (30–60 s):** é normal no plano gratuito do Render, que "dorme" depois de uns 15 minutos sem uso. Abra o link antes de chamar o amigo.
- **Uma peça não gira:** primeiro toque nela para escolhê-la (contorno colorido e etiqueta **↻**); o toque seguinte é que gira. Se a etiqueta mostrar **↻ 0**, os giros acabaram: toque num espaço vazio para soltar a peça e renová-los.
- **A pinça não amplia:** a peça precisa estar escolhida antes (um toque nela). Depois, use dois dedos ao mesmo tempo, em qualquer lugar da área de jogo.
- **Não aparece "Instalar app" no Chrome:** abra o jogo pelo endereço `https://` do Render (não por link de WhatsApp dentro do app) e espere carregar a tela inicial. Se já estiver instalado, a opção não aparece de novo.
- **O aplicativo (APK) mostra uma barra com o endereço no topo:** o Android não conseguiu verificar o aplicativo. Abra `SEU-LINK/diagnostico`: se `encontrado_em` disser "nenhuma", ou se o pacote ou a impressão digital forem diferentes dos do seu `signing-key-info.txt`/APK, corrija o `assetlinks.json` (ou a variável `ASSETLINKS_JSON`). Se estiver certo, abra o jogo no navegador para o servidor acordar, feche o aplicativo e abra de novo; se persistir, desinstale e instale de novo. Se você gerou um APK novo no PWABuilder, a chave mudou: atualize o `assetlinks.json` e desinstale o APK antigo antes de instalar o novo.
- **O botão 💬 não aparece:** os arquivos novos ainda não foram publicados (confira `SEU-LINK/api/config`: deve conter `"chat":true`), o Render ainda não terminou o deploy, ou a variável `CHAT_ENABLED` está como `false`. Feche e abra o aplicativo depois.
- **Mensagem recusada ("Calma!"):** é o limite de velocidade; espere um instante.
- **O tutorial abre toda vez:** ele só é lembrado enquanto os dados do site/aplicativo não forem apagados no celular. Toque em **Entendi** no último passo (ou **Pular**) para marcá-lo como visto.
- **Os avisos não chegam:** confira (1) *Ajustes > 🔔* está ligado, (2) a permissão de notificações do celular/aplicativo está liberada, (3) o jogo está **fechado** (com o jogo aberto na tela, o aviso não aparece), (4) vocês estão **na mesma sala** (o aviso só vale enquanto a sala existe) e (5) `PUSH_ENABLED` não está como `false` no Render.
- **O pedido para recomeçar não aparece para o amigo:** ele pode ter saído da sala (aí recomeça na hora) ou o pedido venceu em 30 segundos. Peça de novo.
- **O botão 📍 não aparece:** ele só substitui a lâmpada com uma **peça escolhida** (um toque na peça). Sem peça escolhida, é a lâmpada 💡.
- **Sumiu a faixa com o código:** ela só aparece enquanto o amigo não está na sala (ou se ele sair). O código também é sempre o que está no endereço, depois de `?sala=`.
- **"Não encontramos essa sala":** confira o código (4 caracteres, letras e números). A sala também some se o Render reiniciar o serviço; é só criar outra.
- **"Essa sala já tem duas pessoas":** a sala comporta exatamente duas pessoas. Se alguém caiu, ao voltar pelo mesmo link ela retoma o lugar (e as dicas já usadas continuam usadas).
- **Aparece "Reconectando…":** a internet oscilou. O jogo volta sozinho e mantém o progresso.
- **"Nenhuma imagem encontrada":** a pasta `public/imagens` está vazia ou foi enviada fora do lugar no GitHub.
- **A imagem não aparece:** verifique se a extensão é `.jpg`, `.jpeg`, `.png` ou `.webp` e se o arquivo abre normalmente.
- **Ainda vejo as imagens ou o visual antigos depois de atualizar:** espere o Render marcar **Live** e recarregue a página (feche e abra a aba).
- **Jogo na horizontal:** funciona, mas as peças ficam menores. O ideal é jogar com o celular **em pé**.

---

## Checklist antes de publicar

- [ ] As imagens que quero estão em `public/imagens/` e as de exemplo antigas (`imagem1.jpg` a `imagem4.jpg`) foram apagadas.
- [ ] As imagens são leves (de preferência abaixo de 500 KB) e abrem normalmente.
- [ ] No GitHub, `server.js` e `package.json` aparecem na **primeira tela** do repositório (não dentro de outra pasta).
- [ ] A pasta `public` subiu com `index.html`, `style.css`, `game.js` e a pasta `imagens`.
- [ ] No Render: Build Command `npm install` e Start Command `npm start`.
- [ ] O deploy terminou como **Live** e `https://SEU-ENDERECO.onrender.com/health` mostra `ok`.
- [ ] Abri o jogo em duas abas com nomes diferentes: criar partida, entrar, mover uma peça e ver nas duas telas.
- [ ] Testei a quantidade de peças que pretendo usar (6, 12, 20, 30 ou 48) no celular.
- [ ] Testei arrastar, girar tocando de novo na peça escolhida (máx. 3 giros), a pinça (zoom), encaixar e a tela de vitória com os nomes.
- [ ] Testei a lâmpada 💡: a imagem aparece atrás das peças, some sozinha depois de 4 segundos e cada jogador tem 10 usos.
- [ ] Testei a conversa 💬 nos dois aparelhos: enviar, receber, o aviso com a conversa fechada, uma reação rápida e o teclado do celular (o painel deve subir junto com ele).
- [ ] Vi o tutorial animado na primeira partida e escolhi nome e avatar; testei o modo escuro e o texto A++ nas telas principais.
- [ ] Testei a dica de lugar 📍, os marcos (25/50/75%), os sons e o botão de silêncio.
- [ ] Testei recomeçar com a confirmação do amigo (aceitar, recusar e deixar vencer) e a vitória (recorde, salvar e compartilhar).
- [ ] (Opcional) Liguei os avisos com o app fechado, fechei o jogo e pedi ao amigo para escrever uma mensagem.
- [ ] Conferi que o tabuleiro está grande o bastante na tela do celular e que as peças da bandeja são fáceis de pegar com o dedo.
- [ ] Testei a exclusividade (a segunda pessoa não consegue pegar a peça que a primeira segura).
- [ ] (Opcional, aplicativo) `SEU-LINK/manifest.webmanifest` abre, e a opção **Instalar app** aparece no Chrome do Android.
- [ ] (Opcional, APK) Guardei o `.zip` do PWABuilder com a chave de assinatura e colei o `assetlinks.json` em `public/assetlinks.json`.
- [ ] Combinei com o amigo de abrir o jogo um pouco antes e passei o código da sala (por causa do "sono" do plano gratuito).

Bom jogo! 🧩
