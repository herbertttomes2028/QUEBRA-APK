# CONTINUIDADE — ESTADO ATUAL DO PROJETO (LEIA ESTA SEÇÃO PRIMEIRO)

**Atualizado em:** 10/11/2026 (America/Fortaleza). **`main` confirmada no GitHub:** `68e7751` (Merge do PR #70, "suavidade"). O pacote **"perfil-abas"** parte dela e leva a suíte a **472 testes passando** (64 arquivos, PostgreSQL 16 real, Node 22 e Node 18, `npm audit --omit=dev` sem vulnerabilidades).
Esta seção substitui qualquer estado descrito mais abaixo. O que vem depois da linha **"HISTÓRICO ANTERIOR PRESERVADO"** são as notas das rodadas até 31/10/2026, mantidas sem alteração: servem de arquivo, **podem estar desatualizadas** e não descrevem o mascote, as conquistas novas, a preparação da Play Store nem as denúncias.

> **Regra de ouro ao abrir uma sessão nova:** (1) rode `git ls-remote https://github.com/herbertttomes2028/QUEBRA-APK refs/heads/main` e compare com o commit acima; (2) se for diferente, **não parta deste arquivo**: clone a `main` e releia o que mudou; (3) nunca parta de pacote ou clone antigo; (4) uma saída de `git fetch` cortada **não prova** nada (já causou um pacote inteiro descartado em 02/11/2026).

## 1. O que é o projeto

Jogo de quebra-cabeça online para dois jogadores (cooperativo, Solo e **Sala Desafio** com dois modos: Comum e Quebrando Cabeças), em Node + Express + Socket.IO, jogado no celular. Contas opcionais (e-mail e senha), amigos por código, convites, XP e níveis, gemas, conquistas, coleções de imagens, mascote 3D na tela inicial, denúncia e bloqueio de jogadores.

| Item | Valor |
| --- | --- |
| Proprietário | Herbert (estudante de Pedagogia, Brasil). Escreve em português e pede respostas diretas e detalhadas |
| Repositório | `herbertttomes2028/QUEBRA-APK` (público; **nunca** pôr segredos nele) |
| Hospedagem | Render, plano gratuito (dorme sem uso: primeira resposta leva de 11 a 22 s e **derruba salas abertas**). Endereço: `https://quebra-apk.onrender.com` (o serviço no painel se chama `quebra-apk`; o `render.yaml` usa `quebra-cabeca-a-dois`) |
| Banco | PostgreSQL no Neon (plano gratuito), ligado só se existir `DATABASE_URL`. Sem ela o jogo funciona como visitante |
| E-mail | Brevo (API web), para códigos de confirmação e avisos de denúncia |
| Aplicativo Android | TWA (Trusted Web Activity): uma moldura do site. Pacote `com.onrender.quebra_apk.twa` (**permanente** na Play) |
| Público | **13 anos ou mais**, definido pelo proprietário. Não é direcionado a menores de 13 |

## 2. Mapa de arquivos

| Arquivo | Linhas | Papel |
| --- | ---: | --- |
| `server.js` | 1115 | Express, Socket.IO, salas cooperativas, `tryLock`/`SNAP`, `/api/config`, `/diagnostico`, assetlinks, CSP |
| `challenge.js` | 639 | Sala Desafio (corrida, contagem, modos, desconexão, revanche) |
| `accounts.js` | 1118 | Contas, login, amigos, convites, partida salva, histórico, XP (`payMatch`), bloqueio, **denúncia**, exclusão |
| `mailer.js` | 135 | Envio pelo Brevo, e-mail de código e **e-mail de aviso de denúncia** |
| `db.js`, `security.js`, `resource-guard.js` | 76, 139, 116 | Banco e migrações automáticas; limites, cabeçalhos e CSP; proteção de recursos |
| `xp.js`, `gems.js`, `achievements.js`, `library.js`, `phrases.js`, `media.js` | 70, 34, 337, 199, 55, 29 | XP/níveis, gemas, conquistas, biblioteca de coleções, frases prontas, mídia |
| `public/index.html`, `game.js`, `conta.js`, `style.css` | 794, 3970, 1084, 2442 | Telas, jogo, contas/amigos/denúncia, visual |
| `public/mascot.js`, `mascot-core.js` | 246, 397 | Mascote 3D (WebGL próprio, sem biblioteca) |
| `public/mascot-looks.js`, `pet.js`, `pet.css` | ~19.500, ~5.000, ~1.300 | Skins e roupas do mascote (módulo puro, testável em Node) e a janela "Meu pet" (escolha + memória local) |
| `public/sw.js`, `boot.js`, `manifest.webmanifest` | 166, 9, 20 | Service worker (`quebra-cabeca-v21`), abertura sem piscar, manifesto |
| `public/privacidade.html`, `excluir-conta.html` | 103, 49 | Política (13+) e página pública de exclusão de conta (URL pedida pela Play) |
| `public/assetlinks.json` | 13 | Vínculo site–aplicativo (veja a seção 8) |
| `public/imagens/` | 9 + `mini/` | **Só** as 9 ilustrações originais do jogo |
| `public/biblioteca/` | 157 + `mini/` | Imagens da biblioteca (catálogo no banco): 128 de domínio público (Wikimedia) + as 29 do **Baú das Maravilhas** (enviadas pelo proprietário) |
| `migrations/` | 12 | `001` a `012` (veja a seção 3) |
| `tests/` | 51 | Suíte completa; `tests/LEIA-ME.md` explica como rodar |
| `.github/workflows/` | 2 | `gemas-postgres.yml` (Node 22 + PostgreSQL 16 + suíte completa), `seguranca-dependencias.yml` |
| Documentos | | `README.md`, `CONTAS.md`, `SEGURANCA.md` (a seção 12 trata de denúncias e moderação), `XP.md`, `ANDROID.md`, `PERFIL-AMIGO.md`, `CONQUISTAS.md`, `AUDITORIA-SEGURANCA-2026-10-31.md` |

## 3. Banco de dados

Migrações aplicadas sozinhas quando o servidor liga: `001_contas`, `002_seguranca`, `003_xp`, `004_modo_solo`, `005_gemas`, `006_biblioteca`, `007_remover_fotos_enviadas`, `008_catalogo_biblioteca`, `009`, `010`, `011` (lotes de imagens), **`012_denuncias`**. Depois: **`013_desbloqueio_categorias_novas`** e **`014_imagens_2026-11-d`** (veja abaixo).
- **`013_desbloqueio_categorias_novas`:** a `006` só deixava desbloquear `cultura` e `fantasia` (`CHECK`); qualquer categoria paga nova dava **erro 500** na compra. A `013` troca essa trava por uma chave estrangeira com `library_categories` (as compras antigas continuam). **Lição:** toda categoria `gems` nova depende disso; o teste `tests/desbloqueio-categoria-nova-postgres.test.js` cobre.
- **`014_imagens_2026-11-d`:** o **Baú das Maravilhas** (`bau-maravilhas`, ordem 6, **30 gemas**, 29 imagens `lib-bau-01..29`, fonte "Enviada pelo proprietário"). Gerada por `scripts/gerar-lote-imagens.js` a partir de `scripts/lotes/2026-11-d.json`. Para mudar o preço depois, só com uma migração nova (`UPDATE library_categories SET price = …`); as existentes são imutáveis.
- **`015_loja_bandejas`:** tabelas `shop_purchases` (o que cada jogador comprou, com o preço PAGO; `UNIQUE (user_id, item_id)` impede compra duplicada) e `shop_prefs` (bandeja em uso, cor por modelo em `colors` jsonb, animações). As duas apagam com a conta (`ON DELETE CASCADE`). Os ids são validados por padrão de texto, **não** por lista fixa (lição da `006`): item novo não exige migração.
- **`016_loja_pet`:** acrescenta a `shop_prefs` as colunas opcionais `pet_skin` e `pet_outfit` (o id do item equipado; `NULL` = pet de fábrica), com a mesma regra de id das outras. A posse continua em `shop_purchases` (o `item_id` já aceita ids novos). Imutável como as demais (hash em `tests/migrations.sha256.json`).
- **Migrações existentes são imutáveis.** Há trava por hash em `tests/migrations.sha256.json`. Uma migração nova entra com o próximo número, o hash dela é acrescentado a esse arquivo **e** a lista esperada em `tests/gemas-postgres.test.js` é atualizada (esquecer isso derruba o CI).
- **Excluir uma conta apaga tudo em cascata** (toda tabela ligada a `users` usa `ON DELETE CASCADE`; um teste confere isso). A página `excluir-conta.html` promete exatamente isso.
- Tabela `reports` (denúncias): `reporter`, `reported`, `reason` (`apelido|comportamento|outro`), `context` (`perfil|amigos|sala`), `note` (até 200), `reported_name` (o apelido da hora), `status` (`novo|analisado|resolvido`).

## 4. Rotas e eventos

- **HTTP do servidor:** `GET /.well-known/assetlinks.json`, `/api/config`, `/diagnostico`, `/health`; `POST /api/csp-report`.
- **Contas (`/api/acc`):** `status`, `register`, `login`, `verify`, `verify/resend`, `password/forgot|reset|change`, `google`, `logout`, `logout-all`, `blocks` (GET/POST/remove), **`reports`**, `me`, `achievements`, `profile`, `import`, `delete`, `friends` (+ `search`, `request`, `respond`, `remove`, `profile`), `matches`, `library` (+ `unlock`), `save` (+ `discard`).
- **Socket (cliente→servidor):** cooperativo `create join grab move drop rotate hint spot chat imgready restart rematch:answer rematch:cancel push:subscribe push:unsubscribe`; Desafio `ch:create ch:join ch:ready ch:grab ch:move ch:drop ch:rotate ch:gift ch:hint ch:spot ch:chat ch:imgready ch:leave ch:rematch ch:push:*`; contas `acc:auth acc:logout acc:continue acc:blockPeer` e **`acc:reportPeer`**; convites `inv:send inv:respond`.
- **Sala Desafio (mudança de 10/11):** `ch:rotate` e `ch:gift` **continuam existindo só para clientes antigos**: o primeiro é ignorado (nada gira) e o segundo responde `{ok:false, error:'auto'}`. A caixa agora cospe sozinha: `ch:gift` chega do servidor com `auto:true`, `k` (0 a 2), `delay` e, na largada, `start:true`.
- **Servidor→cliente:** `state meta grabbed moved released locked rotated won deny chat rematch`, `ch:lobby ch:countdown ch:progress ch:box ch:gift ch:end ch:cancel ch:rematch`, `acc:ev`.

## 5. Contratos que NÃO podem ser quebrados (todos têm teste)

1. **Migrações 001–003 e todas as seguintes são imutáveis** (hash travado).
2. **Regra de encaixe duplicada:** as duas cópias de `tryLock` (`server.js:549` e `challenge.js:329`) ficam iguais; `SNAP = round(TILE × SNAP_FACTOR)` nos dois layouts, com o fator **definido uma única vez em `server.js`** (padrão **0,5**; era 0,33 até 10/11/2026) e repassado ao `challenge.js`. A regra vive só no servidor: soltar a peça com o **centro** a até `SNAP` do centro da casa certa, com giro 0, encaixa sozinha (o encaixe nunca acontece durante o arrasto, só ao soltar; e nunca em casa errada). **Desde 11/11/2026 o encaixe também é conferido ENQUANTO se arrasta** (ver o próximo item); antes só acontecia ao soltar.
   - **Ímã ao ARRASTAR (11/11/2026).** O servidor chama o mesmo `tryLock` também no `move` (cooperativo/Solo) e no `ch:move` (Sala Desafio): segurando a peça (dedo ainda na tela) e passando pela zona do ímã da PRÓPRIA casa, ela é puxada na hora (`locked`, progresso, vitória e a caixa mágica seguem as mesmas regras). `magnet.js` (função pura) usa o **trecho** entre a posição anterior e a nova (as posições chegam a cada ~50 ms: um arrasto rápido pode atravessar a zona entre duas amostras): vale se o trecho tem até 2,5 casas (salto de rede ou peça saindo da bandeja nunca conta como "passou por cima"). Nada de `SNAP`/`magnet` no cliente: o celular só obedece ao `locked` (e, se a peça travou enquanto era segurada, encerra o arrasto e desmarca `dragging` da bandeja). As duas `tryLock` NÃO mudaram. **Chave de segurança:** `DRAG_MAGNET=0` no Render volta ao "só ao soltar" (aparece em `/diagnostico` → `encaixe.puxa_ao_arrastar`).
   - **Pet: 3 reações, 5 skins e 5 roupas novas (11/11/2026).** (1) **Nada do que existia mudou**: `tests/pet-novidades.test.js` guarda um "retrato" (hash) das 21 reações, 14 expressões, mapas de botão/evento, `SPEC`, `RANGE`, `PART_DEFS`, `computeParts` e `createBrain` tirado da `main` anterior; qualquer edição neles reprova. Só se acrescenta. (2) **Reações novas** (prioridade 2): `admire` (botão Loja: `PRESS_MAP.shop`), `cuddle` (segurar o dedo no pet por 650 ms: `HOLD_MS`, no `mascot.js`; soltar antes é toque normal) e `heart` (novo amigo: `EVENT_MAP.friend`, avisado pelo `conta.js` com `Mascot.note('friend')`, guardado até 90 s se fora da tela inicial). Teste de "ineditismo": distância de pose ≥ 0,55 de todas as 21 existentes. (3) **Skins** (`mascot-looks.js`): só trocam a COR das peças que já existem (corpo/braços/pálpebras, dentinho, mãos, pés, bochechas) e acrescentam "pintas" (esferas chatas) fora do rosto; as cores de fábrica (`PART_DEFS`) nunca são alteradas. (4) **Roupas**: peças novas no referencial do corpo (acompanham pulo, giro e achatamento): capa de herói, cachecol, chapéu de mago, saia de bailarina, macacão. Malhas por `belt`/`cone` (superfície do próprio corpo, então acompanham os cantos arredondados). **Regras testadas**: o rosto fica livre (máscara de olhos, sobrancelhas, bochechas e boca aberta); a cor principal da roupa é escolhida entre uma lista pela que mais contrasta com a skin atual (`pick`, distância ≥ 0,55; o macacão azul sumia no pet azul); cabe na câmera (topo ≤ 1,4, laterais ≤ 1,55); no máximo 3 malhas, 2.500 vértices e 8 peças por roupa. (5) **Escolha e memória em `pet.js`** (não no `mascot.js`, que continua sem armazenamento, janelas e teclado, como os testes antigos exigem): `localStorage` chave `qc.pet`, só neste aparelho, sempre filtrada por `Looks.sanitize` (id desconhecido, malicioso ou JSON corrompido = pet de fábrica). (6) O desenho de reserva (SVG, sem WebGL) só ganha as cores da skin; roupas só aparecem no 3D.
   - **Skins e roupas do pet NA LOJA (11/11/2026).** (1) **Catálogo** em `shop.js`: categorias `bandejas`, `skins` e `roupas`; os itens do pet têm id `skin-<aparência>` ou `roupa-<aparência>` (a aparência é o id de `mascot-looks.js`) e o campo `look`. **Preço 0 = grátis para todos, sem comprar** (as 10 aparências de antes); as outras 10 custam gemas: skins Limão 100, Caramelo 100, Lavanda 180, Cereja 320, Ouro 500; roupas Bandana 150, Fones 250, Cartola 350, Asas de anjo 450, Coroa real 600. **A raridade vem sempre do preço** (`rarityOf`: comum ≤ 150, rara ≤ 300, épica ≤ 450, lendária acima), então nunca contradiz o preço. (2) **`owned` NÃO mudou de significado**: continua sendo a bandeja Clássica + o que foi comprado; item de preço 0 não aparece lá. Quem decide se um item do pet pode ser usado é `usável = preço 0 ou comprado` (`usablePet` no servidor, `petUsable` no cliente). (3) **Equipar** (`POST /shop/equip`): `{ itemId }` para equipar (a categoria do item escolhe a coluna `pet_skin`/`pet_outfit`; nome da coluna vem de uma lista fixa, nunca do cliente) e `{ category, itemId: null }` para tirar; categoria que não é a do item = `invalid` (400); pago que não é seu = `locked` (403); sem gemas = 409 com o que falta. `GET /shop` devolve `pet: { skin, outfit }` (ids de item; o que o banco guardou só vale se ainda for usável). (4) **Compra**: a mesma transação atômica das bandejas (`SELECT … FOR UPDATE`, `UNIQUE (user_id, item_id)`); não existe sistema de compra de gemas por dinheiro (fica para o futuro, de propósito). (5) **Cliente** (`loja.js`): chips de categoria de verdade, `petCard`, `QC.shopPet` (`state`, `pick`, `ready`, `on`) usado pela janela "Meu pet" (`pet.js`, que não guarda nada sozinho). Visitante: só o grátis vale, guardado em `qc.pet`; conta: o servidor manda (cópia local em `qc.petc`, até o servidor responder). **`loja.js` carrega ANTES de `mascot-looks.js`**: por isso o `pet.js` chama `QC.shopPet.ready()` para reler o que estava guardado (sem isso a escolha sumia ao recarregar). (6) **Miniaturas** em `public/pet/<id>.webp` (240×180, fundo transparente, ~6 KB cada): geradas do pet 3D real com um script de navegador (`pet_thumbs.js`: define a aparência, tira o fundo, recorta o elemento do mascote e converte com PIL para WebP). **Se uma aparência mudar, regerar a miniatura.** Um teste confere que existe exatamente uma por item. (7) **Para acrescentar um item**: aparência em `mascot-looks.js` (`free: false`), item em `shop.js` (preço decide a raridade), miniatura em `public/pet/`; os testes de coerência (`tests/pet-loja.test.js`) reprovam se faltar qualquer uma das três.
   - **Fundos padronizados e cabeçalhos novos (11/11/2026).** (1) **Fonte única do fundo:** `scripts/fundos.js` (especificação das variações + gerador). `node scripts/fundos.js` escreve `public/fundos/*.svg` e `public/fundos.css`; `--check` confere (o teste `tests/fundos.test.js` faz isso). **Nunca editar os SVG nem o `fundos.css` à mão**; para mudar uma peça, mudar a especificação e regerar. Referência: `fundo_sala_desafio.json` (base `#111633`, 2 luzes radiais, 4 a 7 peças sem contorno, opacidade 0,20 a 0,45, peças nas BORDAS, centro livre); a variação `desafio` é exatamente a do JSON. Variações: inicio, categorias, colecoes, montagem (só 4 peças pequenas e discretas nos cantos, longe do tabuleiro), desafio, loja (amarelo/roxo), amigos (turquesa/verde/rosa), ajustes (azul/cinza), conta; mais a `janela` (só peças, sobre a folha das janelas, pastel no tema claro). (2) **Aplicação:** cada tela tem `data-fundo="<variação>"` (`#screen-pick` troca entre `categorias` e `colecoes` pelo JS); as janelas grandes têm `data-janela` (`loja`, `ajustes`, `amigos`); as demais usam a folha genérica. O CSS usa `html body :is(telas)[data-fundo]` para vencer os fundos antigos; `fundos.css` e `telas.css` são os DOIS ÚLTIMOS links. (3) **O fundo ACOMPANHA O TEMA (corrigido na rodada "abas-tema"):** escuro = marinho do JSON (`fundos/<variação>.svg`); claro = o degradê lavanda de sempre (`#F6F7FF`→`#DFE5FF`) com as mesmas peças e luzes em tons pastel (`fundos/<variação>-claro.svg`). O CSS escolhe por `html[data-theme="dark"]`. Os textos soltos usam `--stage-ink`/`--stage-soft`, que são APENAS apelidos de `--ink`/`--ink-soft` do tema (nunca cores fixas); o destaque do título é `--pick-hl` (rosa-escuro no claro, amarelo no escuro). Se criar uma tela nova, **rodar a auditoria de contraste** nos DOIS temas. (4) **A tela de montagem mantém a cor da bandeja equipada:** `loja.js` marca `#screen-game` com `data-tint` quando pinta a tela; nesse caso o fundo vira o papel da bandeja + peças pastel/marinho tênues (`--janela-img`); sem bandeja colorida, fundo marinho. (5) **Cabeçalhos:** categorias = voltar (menor, ≥ 44 px de toque por uma borda invisível de 7 px; fica numa camada acima do cabeçalho animado) → `ESCOLHA UMA CATEGORIA` (última palavra em amarelo) → `Explore imagens e complete suas coleções.` → separador de 3 peças. Coleção = nome (principal) → `ESCOLHA SUA IMAGEM` (discreto) → progresso em peças encaixadas + `n/total concluídas` → selo com TODAS as coleções que o progresso libera (`libraryNames`: "A, B e C"). Os ids antigos (`library-heading`, `library-detail`, `library-gate`…) continuam. (6) **`public/pecas.js`** (puro) tem a forma da peça, usada pelo gerador do fundo e pelo indicador de progresso; **`public/cabecalhos.js`** só monta elementos por DOM. Mais de 20 imagens = 20 peças, proporcional (nunca mostra completo sem estar). (7) **As regras de liberação, progresso e compra das coleções NÃO mudaram**: `tests/fundos.test.js` guarda o hash das 11 funções `library*` da `main` anterior. (8) **Lições da verificação:** a auditoria mede o contraste de CADA texto contra o fundo REAL (foto com o texto invisível) e ignora o que está coberto, invisível ou desativado; foi ela que achou 21 textos ilegíveis no tema claro, não o olho.
   - **Cabeçalho FIXO, Voltar padronizado e barra de abas (rodada "abas-tema").** (1) **`#screen-pick`**: o bloco `.pick-fixo` (Voltar, título, subtítulo e separador; ou, na coleção, nome, orientação, progresso e selo) fica FORA do `#pick-scroll`, então não rola; só categorias/imagens rolam (a lista "nasce" sob o cabeçalho por uma máscara de 14 px). `library-continue` fica na lista que rola (para o cabeçalho não ficar alto em celular pequeno). Trocar de vista por ação do jogador volta a lista ao topo (`pickScrollTop`); **`refreshLibrary` NÃO pode zerar a rolagem** (teste). (2) **Voltar = UM padrão** para `#btn-pick-back`, `#me-back` (Amigos/Conta) e `#lobby-leave`: botão amarelo, 34 px, toque ≥ 44 px (borda invisível de 7 px), mesmo canto (16 px, 12 px); o da Sala Desafio é `position: absolute` porque a recepção centraliza o conteúdo na vertical. (3) **Barra de abas** `<nav class="tabbar">` fixa no rodapé da tela inicial, filha direta de `#screen-home` (sem `transform` por perto, senão `position: fixed` vira relativo): Amigos, Loja e Ajustes com os MESMOS ids (`link-friends`, `link-shop`, `link-settings`; o mascote, a conta e a loja continuam ligados a eles), Amigos só com contas ligadas. Ícones de peça de quebra-cabeça desenhados por `QCCab.icone` com `QCPecas.caminho` (amigos = duas peças encaixadas; loja = peça com gema; ajustes = peça com engrenagem). `#screen-home` ganha `padding-bottom` de 84 px para o conteúdo nunca ficar atrás da barra. A barra só existe na tela inicial.
   - **Suavidade (rodada `suavidade`).** (1) **Método (reaproveitar):** medir ANTES de mexer, com a CPU a 1/4 (`Emulation.setCPUThrottlingRate`) e medidor de quadros por `requestAnimationFrame` (quadros > 33 ms e o tempo perdido: soma de `d - 16,7` para `d > 25`), perfil de CPU por amostragem (`Profiler`) para achar a FUNÇÃO, e **A/B alternando as versões 3 vezes** (o ruído é grande; uma rodada engana). O navegador de teste NÃO tem GPU (pintura por software): os números servem para comparar, não para prometer o resultado no celular. Intervalos grandes de quadro com a thread principal OCIOSA no perfil são pintura por software e o código não os controla. (2) **Recorte da imagem da partida em Web Worker** (`public/crop-worker.js`): `cropToBlob` cria um `ImageBitmap` e o TRANSFERE ao worker, que recorta (mesmo cálculo de `cropMain`), redimensiona e codifica JPEG 0,9 com `OffscreenCanvas.convertToBlob`; a thread principal só recebe o blob. Medido: bloqueio de 100–730 ms → ~10 ms; maior tarefa longa da abertura 1.277–2.001 ms → 116 ms. **Plano B sempre:** sem Worker/OffscreenCanvas/createImageBitmap/convertToBlob, ou worker que falha ao carregar ou morre, ou imagem sem CORS, cai em `cropMain` (o caminho antigo, intacto); testado nos dois casos. O worker é criado ao entrar na escolha (`warmCanvasEncoder` → `cropWorkerGet`); só em aparelho SEM worker o 1º `toBlob` (~4x mais caro) é pago antecipadamente com um desenho 16×16 em tempo ocioso. `worker-src 'self'` já existia em `security.js`. (3) **Pet:** `capNow` mantém a taxa cheia por `SETTLE_MS` = 900 ms depois de `brain.busy()` (as molas assentam ~0,5 s; antes o laço caía para 12 fps no instante em que a reação acabava): 9 → 15–18 quadros nos 0,7 s seguintes. `mascot-core.js` NÃO mudou (o teste do retrato continua valendo). (4) **Peças:** `suave.css` (último link) com `.piece { will-change: transform; contain: layout style; }` (A/B: tempo perdido no arrasto 106 → 17 ms, quadros lentos 2 → 1); **nunca `contain: paint`** (cortaria a etiqueta e o brilho). (5) **Medidas finais (CPU 4x, sem GPU), antes → depois:** pet reagindo 24 → 25 fps (limite do navegador de teste); arrasto 55,6 → 57 fps e 250 → 167 ms perdidos; Jogar → categorias 35 → 53 fps (nas rodadas isoladas empata com a `main`); abrir coleção 42 → 52 fps. (6) **Testado e DESCARTADO:** pré-decodificar as capas das categorias com o app parado (isolado: 639 contra 550 ms sem ele, e gastaria os dados); aquecer o canvas na thread principal ao entrar nas categorias (caía justo na transição: 1.016 contra 527 ms da `main`); `createImageBitmap` + `OffscreenCanvas` na thread principal (empata com o `toBlob` depois da 1ª chamada); simplificar os raios/sombra da abertura (dentro do ruído, ≈ 20–30 ms).
   - **Meu espaço: conquistas só na aba do troféu e coleções dentro da tela (rodada `perfil-abas`).** (1) A aba **Perfil** mostra só avatar/nome, gemas, XP, código de amigo, **estatísticas**, Segurança e conta. O bloco "Conquistas / Quase lá / Ver todas" (`#me-ach`, `#me-ach-count`, `#me-ach-all`, `paintAchNext`, `paintAchLoading`) FOI REMOVIDO; as conquistas vivem em `#tab-ach` (aba do troféu: resumo, filtros, grupos e lista). `updateAchBadge` (selo de novidades na aba) e `QC.showAchievements` (o aviso de "conquista concluída" abre a aba do troféu) continuam. A aba **Coleções** ainda lista, em cada cartão, as conquistas daquela coleção (decisão não pedida para remover; ver risco). (2) **Causa do vazamento nas Coleções:** `contain-intrinsic-size: auto 420px` com UM valor vale para largura E altura; com `content-visibility: auto` o cartão ficava com 420 px de LARGURA estimada na grade (448 com o padding) e passava da tela de 360 px (183 elementos fora, rolagem horizontal). Agora só se estima a ALTURA (`contain-intrinsic-height`), `.col-list` usa `grid-template-columns: minmax(0, 1fr)` e `.col-card` tem `min-width: 0`. **Nenhum CSS pode usar `contain-intrinsic-size`** (teste varre `public/*.css` sem os comentários); o cartão da loja tinha o mesmo defeito latente e também foi corrigido. O contador "n de 6 abertas · x de y imagens" ficou numa linha própria (`#tab-col > .me-h small`). (3) Roteiro `perfil_verifica.js` (conta real, 320/360/412 px, claro e escuro): 21 verificações; na `main` anterior reprovam 13.
3. **Eventos de socket** do cooperativo, do Desafio e de contas continuam existindo com os mesmos nomes.
4. **XP só entra por `payMatch`**, e só `accounts.js` o usa, dentro de transação. **Nenhuma rota recebe XP do cliente.**
5. Exports de `createAccounts` e das fábricas permanecem. Sessão: o token cru nunca é guardado (só `sha256`).
6. **Bate-papo só com frases prontas** (`phrases.js`): nunca texto livre. Nenhuma foto ou imagem enviada por jogador (as rotas antigas respondem 410).
7. **CSP** com `script-src` estrito, sem script embutido, `frame-ancestors none` sempre. Chaves do aparelho `qc.*` usadas pelo cliente são fixas. `package.json` com `start` e Node `>= 18`. `render.yaml` sem chaves duplicadas e com variáveis só no painel (`sync: false`).
8. **Privacidade de outros jogadores:** nunca expor e-mail nem XP bruto. "Código inexistente", "não é seu amigo", "pedido pendente" e "bloqueado" dão a **mesma resposta**.
9. **Novos nesta fase (Play Store):**
   - O cadastro (e-mail e Google) exige `consent === true` **e** `age13 === true` (só o booleano `true`). Visitante não precisa.
   - **A pessoa denunciada nunca é avisada**, e o **e-mail de aviso nunca traz e-mail, código, apelido nem identificador de quem denunciou**. Apelido e nota de jogador saem escapados, sem quebras de linha e **nunca dentro de comandos SQL** (só o código de amigo, conferido contra o alfabeto `23456789ABCDEFGHJKMNPQRSTUVWXYZ`).
   - A galeria padrão (`public/imagens/`) contém **só** as 9 ilustrações originais. Teste proíbe personagens de terceiros, pessoas reais e origem desconhecida (a pasta já teve Batman, Stitch, Angel, Lula, Jesus e Aparecida; foram removidos para a loja).
   - A linguagem da loja, do app e da política **nunca** apresenta o jogo como infantil.
   - `public/assetlinks.json` mantém o pacote certo e as impressões digitais conhecidas (`tests/assetlinks.test.js`).
   - **Sala Desafio sem giro (10/11/2026):** as peças **nascem com `rot 0`** nos dois modos e nos dois tabuleiros (a regra de encaixe `tryLock` não mudou); o cliente **não gira, não mostra ▲ nem ↻** e o tutorial não tem o passo "Girar". O Solo e o Cooperativo já eram assim.
   - **Quebrando Cabeças: caixa automática.** Na largada o servidor cospe a 1ª rodada (3 peças) em **cada** tabuleiro, **na mesma ordem** (`spitFirstRound`, só depois do `ch:start`); a cada rodada encaixada cospe as 3 seguintes. **Ninguém toca na caixa** (ela é um `div`, não botão). O cliente **guarda numa fila** (`giftQ`) as peças que chegam antes de o tabuleiro estar montado (a montagem é assíncrona) e as anima ao ficar pronto; quem volta de uma queda recebe as peças no lugar pelo snapshot, sem repetir a animação.
   - **Loja e bandejas (10/11/2026).** O catálogo (5 bandejas, preços, estrutura de categorias) vive só em `shop.js`; `public/loja.js` tem uma cópia **reserva** para ficar sem internet e `tests/loja-bandejas.test.js` exige que as duas sejam iguais. A compra usa **só as gemas existentes** (`users.gems`), é atômica (`SELECT … FOR UPDATE` no jogador, confere posse e saldo, grava e debita no mesmo `COMMIT`, igual a `library.buy`) e **só acontece no servidor depois da confirmação na tela**. Nunca criar moeda nova nem pagamento real. A conta vem sempre do login, nunca do corpo do pedido.
   - **A bandeja é só decoração.** `QC.tray.build` insere `.tray-skin` logo **depois de `#board`** (as peças ficam por cima), com `pointer-events: none` e `z-index: 0`. Ela **nunca** mexe em peças, encaixe, eventos de socket ou no layout do servidor; a grade fica idêntica em todos os modelos. O `game.js` tem exatamente 5 chamadas a `QC.tray` (construir; brilho ao retirar + marcar arrasto; desmarcar arrasto; brilho ao escolher, que roda ao SOLTAR um toque simples). **Nada da loja roda no instante do toque** (`onPointerDown`): ali o jogo já faz o trabalho mais pesado do arrasto. A camada desce 42 unidades além do campo (espaço vazio da tela) para formar o "lábio" colorido.
   - **Animações das bandejas (orçamento de camadas):** só `transform` e `opacity` (testado). **Cada elemento animado vira uma camada de GPU**: por isso as partículas ficam em poucos grupos (um `<svg>` por grupo; 3 a 6 camadas animadas por bandeja, medido 55→28 camadas em 12 peças). As de ambiente pausam durante o arrasto (`#field.dragging`) e **rolando a loja** (`.scrolling`); tudo para com `data-tray-anim="off"`, `data-motion="reduce"` ou `prefers-reduced-motion`. O brilho de "peça retirada" usa duas animações idênticas A/B (`.fx-a`/`.fx-b`: reinicia sem forçar layout), é um círculo pequeno e já existe como camada (`will-change`, opacidade .01) antes do toque; **não pode** ser pausado pelo arrasto.
   - **Loja leve (11/11/2026).** A lista usa **prévias estáticas**: `previewImage()` gera um SVG autocontido desenhado UMA vez num `<canvas>` (em segundo plano); só "Visualizar" e "Minhas Bandejas" têm a bandeja viva, uma por vez. A loja é **pré-montada escondida** quando o app fica ocioso (`prewarm`), só consulta o servidor se os dados têm mais de 20 s, não redesenha se os dados não mudaram (`sig()`), e os cartões usam `content-visibility: auto`. Nunca voltar a animar as 5 prévias da lista (travava ao abrir e ao rolar: 1,4 s de quadro parado e 3,8 s de trabalho em 3 s de rolagem com a CPU a 1/4).
   - **Cor da PARTIDA inteira (11/11/2026).** A cor da bandeja equipada pinta a tela da partida (`#screen-game`: `--paper`, `--paper-2/3`, `--field`, `--field-bg`, `--field-ring`, `--board-ring`, `--grid`, `--track`, `--line`) e a cor da barra de status (`meta theme-color`), **só trocando variáveis de cor** (tamanho, posição e encaixe não mudam). Matiz e saturação vêm da cor; a claridade é fixa por tema (`themeVars(hex, dark)`), com contraste testado em 312 cores nos dois temas. Aplica quando a bandeja não é a Clássica de fábrica ou a Clássica tem cor escolhida; **limpa ao sair da partida** (`QC.onScreen`) e repinta ao trocar claro/escuro. A decisão anterior "a grade nunca muda" vale só para **geometria**; a cor da grade agora acompanha.
   - **Cor segura:** a cor escolhida é guardada como está, mas desenhada por `safeTray()` (limita claridade HSL e luminância percebida, e garante contraste da borda), para peças e interface continuarem visíveis. Cores só em `#rrggbb` (validadas no servidor e no cliente).
   - **Nenhum segredo no repositório** (`tests/sem-segredos.test.js`, roda em todo Pull Request): sem chaves de API (Brevo, Google, GitHub, AWS, Slack), sem chave VAPID privada, sem endereço de banco com senha fora do computador local, sem senha ou token escritos como texto no código, e sem arquivo `.keystore/.jks/.p12/.pem/.key`, `.env`, `dados-da-chave.txt`, pasta `chave-de-envio/`, `.apk` ou `.aab`. Segredos vivem **só** no painel do Render (Environment) e no computador do proprietário. Valores de mentira em testes devem ser **gerados na hora** (`crypto.randomBytes`), nunca escritos fixos.

## 6. Variáveis de ambiente (painel do Render › Environment; nunca no GitHub)

| Variável | Efeito |
| --- | --- |
| `DATABASE_URL` | Liga contas, amigos, XP, histórico. Sem ela, só visitante |
| `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME` | E-mail transacional. O remetente precisa estar confirmado no Brevo |
| `REPORT_NOTIFY_EMAIL` | Destino do aviso de denúncia. Se ausente, usa o remetente do Brevo. Valor inválido **desliga** o aviso |
| `REPORT_MAIL_MAX_PER_HOUR` | Teto de e-mails de denúncia por hora (padrão 20; `0` desliga). As denúncias continuam salvas no banco |
| `ASSETLINKS_JSON` | Conteúdo do vínculo Android; **vence** o arquivo `public/assetlinks.json` |
| `GOOGLE_CLIENT_ID` | Liga o login com Google (hoje desligado; se ligar, refazer a política e o formulário "Segurança dos dados") |
| `CHAT_ENABLED`, `PUSH_ENABLED`, `VAPID_*`, `CSP_MODE`, `MAX_IMAGES`, `CH_COUNTDOWN_MS`, `CH_GRACE_MS`, `REMATCH_MS`, `INVITE_MS`, `CODE_LEN`, `DB_POOL_MAX`, `ACC_RATE_MULT` | Ajustes opcionais (veja `README.md` e `SEGURANCA.md`) |
| `CH_START_FIRST_MS` (700), `CH_AUTO_FIRST_MS` (240), `CH_AUTO_STEP_MS` (190) | Tempos da caixa mágica do Quebrando Cabeças: atraso da 1ª peça na largada, atraso da 1ª peça das rodadas seguintes e intervalo entre as peças |
| `SNAP_FACTOR` (0,5) | O **ímã de encaixe**: fração do tamanho da casa. Aceita de 0,25 a 0,75; qualquer outro valor é ignorado e vale 0,5. O `/diagnostico` mostra o valor em uso (`encaixe.raio_em_casas`). Para deixar o jogo mais difícil, baixe (ex.: 0,4); para encaixar mais fácil, suba (ex.: 0,6) |
| `DRAG_MAGNET` (ligado) | `0` desliga só o puxão ao ARRASTAR e volta ao comportamento antigo (encaixe só ao soltar). Qualquer outro valor mantém ligado. O raio continua o do `SNAP_FACTOR` |

## 7. Histórico recente (mais novo primeiro)

| PR | Quando | O que entrou |
| --- | --- | --- |
| (rodada `perfil-abas`) | 12/11 | Conquistas saem do Perfil (ficam só na aba do troféu); **aba Coleções cabe na tela** (causa: `contain-intrinsic-size` com um valor). Só cliente; sem servidor nem banco |
| (rodada `suavidade`) | 12/11 | **Recorte da imagem da partida em Web Worker** (a abertura deixa de travar na thread principal), **pet** sem cair para 12 fps ao fim da reação, **peças** com camada própria (arrasto), medição documentada. Só cliente; sem servidor nem banco |
| (rodada `abas-tema`) | 12/11 | **Fundo segue o tema** (claro como antes, marinho no escuro) com as peças e as variações por tela; textos voltam às cores do tema; **Amigos** legível e **Voltar padronizado**; **cabeçalho FIXO** em Categorias e Coleções (só a lista rola); **barra de abas fixa** (Amigos, Loja, Ajustes) com ícones de peças. Só cliente; sem servidor nem banco |
| (rodada `fundos`) | 11/11 | **Identidade visual unificada**: fundo marinho do JSON em todas as telas, com uma variação por área (gerador `scripts/fundos.js`); janelas com peças pastel/marinho; **cabeçalho novo de Categorias** (voltar menor, título com destaque, subtítulo) e de **Coleções** (nome, orientação, progresso em peças encaixadas, selo de liberação); a montagem mantém a cor da bandeja. Só cliente; sem servidor nem banco |
| (rodada `pet-loja`) | 11/11 | As **10 skins/roupas de antes entram na loja como GRÁTIS** e nascem **10 novas por gemas** (5 skins e 5 roupas, com raridade pelo preço): Limão, Caramelo, Lavanda, Cereja, Ouro; Bandana de pirata, Fones de ouvido, Cartola e gravata-borboleta, Asas de anjo, Coroa real. Loja com categorias Bandejas/Skins/Roupas, fotos 3D, comprar/equipar/tirar, equipado salvo na conta. Migração `016_loja_pet`; `public/pet/*.webp` |
| (rodada `pet-novidades`) | 11/11 | **3 reações novas do pet** (`admire` na Loja, `cuddle` ao segurar, `heart` ao ganhar amigo), **5 skins** (Menta, Pôr do sol, Uva, Algodão-doce, Luar) e **5 roupas** (capa de herói, cachecol, chapéu de mago, saia de bailarina, macacão), com janela "Meu pet" em Ajustes. Novos `mascot-looks.js`, `pet.js`, `pet.css`. Sem servidor nem banco |
| (rodada `ima-ao-arrastar`) | 11/11 | **O ímã puxa a peça ENQUANTO ela é arrastada** (antes só ao soltar): passou pela zona do ímã da casa certa com o dedo ainda segurando, ela trava na hora. Cooperativo, Solo e os dois modos da Sala Desafio. Novo `magnet.js`; chave `DRAG_MAGNET` |
| (rodada `loja-fluida`) | 11/11 | **Loja sem travar** (abrir e rolar), bandejas com 28 camadas em vez de 55 (12 peças), brilho de "peça escolhida" mais leve, **cor da partida inteira** (fundo, tabuleiro e grade) com a cor da bandeja. Só cliente (`loja.js`, `loja.css`, 1 linha do `game.js`); sem servidor nem banco |
| (rodada `bandejas-e-loja`) | 10/11 | **Loja** (primeira categoria: BANDEJAS) e **bandejas personalizáveis**: Clássica (grátis), Nuvem 150, Estrela 250, Gelatina 350, Galáxia 500 gemas; cor livre e grátis por modelo; "Minhas Bandejas"; "Animações das bandejas" nos Ajustes; migração `015`; arquivos novos `shop.js`, `public/loja.js`, `public/loja.css` |
| (rodada `ima-mais-forte`) | 10/11 | **Ímã de encaixe mais forte**: `SNAP` de 0,33 para **0,5** da casa (Cooperativo, Solo e os dois modos da Sala Desafio), por pedido do proprietário. Só o raio mudou. Valor ajustável com `SNAP_FACTOR` |
| (rodada `colecao-bau-e-desafio`) | 10/11 | **Baú das Maravilhas** (29 imagens, 6ª categoria, 30 gemas); **Sala Desafio sem giro**; **caixa mágica automática** no Quebrando Cabeças (cospe a 1ª rodada na largada e as seguintes sozinha); migração `013` (desbloqueio de categorias novas) e `014` (lote de imagens) |
| #57 `aviso-denuncia-email` | 09/11 | Cada denúncia nova gera um e-mail ao responsável (código de amigo, motivo, onde, nota e comandos SQL prontos), sem identificar quem denunciou; teto por hora; `/diagnostico` mostra o estado (destino mascarado). Falha ou lentidão do Brevo **nunca** atrasa nem derruba a denúncia |
| #56 e #55 `prepara-play-store` | 09/11 | 13+ no cadastro; política de privacidade reescrita; página `excluir-conta.html`; **denúncia** (perfil, ações do amigo e menu da sala), migração `012`; galeria sem imagens de risco |
| #54 `mascote-ajustes` | 08/11 | Chave "Mascote na tela inicial" em Ajustes; com movimento reduzido o mascote **some**; animações mais suaves |
| #53 `mascote-inicial` | 06/11 | Mascote 3D na tela inicial (21 reações, WebGL próprio, qualidade adaptativa, fallback SVG) |
| #52 `otimiza-perfil` | 05/11 | `/me?lite=1` e `/achievements` separados; perfil de 700 ms para cerca de 150 ms |
| #51 `corrige-demora-conquistas` | 04/11 | Lista de conquistas em lotes, `content-visibility`; aba de 634 ms para cerca de 190 ms |
| #50 `conquista-concluida` | 04/11 | Cartões "CONQUISTA CONCLUÍDA" no resultado e faixa no topo; filtros Todas/Concluídas/Faltam |
| #46–#49 | 04/11 | `catalogo-banco-limpo`, `imagens-lote-1`, `rodada-a-categorias-nivel`, `conquistas-e-colecoes` (detalhes no histórico abaixo) |

## 8. Publicação na Google Play: onde estamos

**Pronto (conferido):**
- Textos da loja, respostas de público-alvo, "Segurança dos dados", classificação de conteúdo e "Acesso ao app": estão em `PLAY-STORE.md` (neste repositório) e foram preenchidos no documento "Quebra-Cabeça a Dois — ficha da Play Store e respostas dos formulários".
- 6 capturas 1080×1920, gráfico 1024×500 e ícone 512, sem personagens de terceiros nem pessoas reais.
- **AAB** gerado com Bubblewrap 1.27.0 e validado com o `bundletool` 1.18.3 (código de saída 0): pacote `com.onrender.quebra_apk.twa`, `versionCode 2`, `versionName 2`, `minSdk 24`, **`targetSdk 36`**, só a permissão de notificações, assinatura por chave de envio nova (`appVersionCode` **precisa subir** a cada envio).
- Política de privacidade e página de exclusão no ar.

**Barra de endereço (defeito corrigido nesta rodada):** o Android só abre o app em tela cheia se o site declarar, em `/.well-known/assetlinks.json`, a impressão digital **da chave que assinou o app instalado**. Medido em 09/11/2026 com a API oficial `digitalassetlinks.googleapis.com/v1/assetlinks:check`: a chave do APK antigo (`99:50:38:B0:…:5A:53`) estava ligada (`linked: true`) e a chave de envio do APK de teste (`12:D9:5C:57:…:AD:1F`) **não**, por isso o APK de teste mostrava a barra. `public/assetlinks.json` agora lista as duas. Para quem instala **pela Play**, ainda falta a **terceira** impressão digital, a da **chave de assinatura do app** que a Play mostra em *Integridade do app › Assinatura de apps* (só existe depois do primeiro envio). Ela entra na variável `ASSETLINKS_JSON` do Render (com as três impressões) ou no arquivo. O Google guarda o resultado em cache por até cerca de 1 hora; depois de publicar, repita a consulta `assetlinks:check` até aparecer `linked: true`, desinstale o app e instale de novo.

**Como refazer o AAB** (o que funcionou em 09/11/2026): JDK 17 (Temurin), `commandlinetools` do Android com licenças aceitas, `build-tools;36.1.0`; `npm i @bubblewrap/cli@1.27.0`; o Bubblewrap exige `bin` e `lib` direto na raiz do SDK (links para `cmdline-tools/latest`); `~/.bubblewrap/config.json` com `jdkPath` e `androidSdkPath`; `twa-manifest.json` (`packageId` `com.onrender.quebra_apk.twa`, `host` `quebra-apk.onrender.com`, `minSdkVersion 24` porque a biblioteca atual do TWA recusa menos, `fallbackType` `customtabs`, `enableNotifications true`, ícones `/icons/icon-512.png` e `/icons/icon-maskable-512.png`); `bubblewrap update --skipVersionUpgrade` e `bubblewrap build --skipPwaValidation`, com as senhas nas variáveis `BUBBLEWRAP_KEYSTORE_PASSWORD` e `BUBBLEWRAP_KEY_PASSWORD`. **O PWABuilder já foi reportado gerando `targetSdk 35`; a Play exige 36.**
**Segredos:** a chave de envio (`android.keystore`), a senha e o arquivo `dados-da-chave.txt` **ficam só com o proprietário, fora do GitHub** (o CI barra o envio desses nomes). Ela foi gerada no ambiente do assistente; se houver suspeita de vazamento, pedir a redefinição da chave de envio na Play Console.

**Ainda NÃO feito (depende do proprietário ou de terceiros):**
1. Criar a conta de desenvolvedor na Play (taxa única) e concluir a verificação de identidade.
2. **Teste fechado com 12 ou mais testadores por 14 dias seguidos** (contas pessoais novas), depois pedir produção (análise de até cerca de 7 dias).
3. Criar duas contas de teste confirmadas para os revisores ("Acesso ao app").
4. Acrescentar a impressão digital da chave de assinatura da Play ao vínculo (parágrafo acima).
5. **Testar o AAB/APK em um Android real** (nunca foi instalado em aparelho de verdade).
6. Hospedagem que não durma (plano pago do Render) e, depois, domínio próprio (exige AAB novo).

## 9. Como verificar (CI-sim local)

```
# banco temporário local (nunca Neon/Render): DATABASE_URL=postgresql://qc:qc@127.0.0.1:5432/qc_test
export DATABASE_URL=postgresql://qc:qc@127.0.0.1:5432/qc_test GEMAS_TEST_DB=1 CI=true
psql ... -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
npm ci && npm run migrate && npm test      # esperado hoje: 472 testes, 0 falhas
npm audit --omit=dev                        # esperado: 0 vulnerabilidades
```
Rode também em Node 18 (`engines >= 18`). Todo pacote é conferido em **clone limpo da `main` real** com o zip aplicado, comparando a árvore com a do branch de trabalho. **Depois de aplicar o zip, rode `git add -A` e `git commit` ANTES de `npm test`**: os testes de segurança (`seguranca-repositorio`, `sem-segredos`) só leem arquivos acompanhados pelo git, e arquivos novos não registrados passam despercebidos (foi assim que o PR #59 chegou ao CI com um falso positivo). Confira também a árvore ao vivo em `gemas-postgres.yml` e `seguranca-dependencias.yml` (este roda sem banco: espera-se 461 passando e 11 pulados). Mutações deliberadas (estragar o código de propósito) devem ser pegas pelos testes novos.

## 10. Fluxo com o proprietário (regras do projeto)

1. Responder em português, direto e detalhado, com passo a passo no chat para publicar.
2. Antes de qualquer tarefa, ler este arquivo e **confirmar o commit atual da `main`**.
3. Não mexer no que já funciona; alterar só os arquivos necessários.
4. Rodada: o assistente implementa e testa e entrega um `.zip` com a lista exata de arquivos e a pasta de cada um → o proprietário sobe **numa ramificação nova (nunca na `main`)**, abre o Pull Request, faz o Merge, o Render faz o deploy, ele testa no celular e aprova → só então começa a próxima rodada.
5. **O assistente não tem escrita no GitHub: nunca dizer que publicou ou fez deploy.**
6. Afirmar só testes realmente executados; teste em Android real só vale se o proprietário fizer; dizer sempre o que **não** foi testado.
7. Comparar com a `main` atual antes de montar o pacote.
8. Respeitar os contratos da seção 5.
9. Proteger crianças e adolescentes: sem texto livre, sem e-mail nem XP bruto de outros jogadores.

**Como subir arquivos (o que já deu errado):** o upload do GitHub **não apaga** arquivos: o que deve sumir precisa ser apagado à mão (⋯ › Delete file) na mesma ramificação, e a lista de arquivos do Pull Request deve bater com a do pacote (adicionados + apagados). Se um Pull Request já foi mesclado, commits novos da ramificação **não têm botão de merge**: abra um Pull Request novo. Teste vermelho no CI costuma ser o aviso certo (ex.: o de galeria acusou o `stitch.jpg` esquecido). O GitHub no celular não aceita pastas no upload: subir uma pasta de cada vez, entrando nela antes. Mudança em `public/` chega ao app instalado sozinha (cópia guardada atualizada por trás); só o AAB exige nova versão da Play.

## 11. Erros encontrados e corrigidos nesta fase (09/11/2026)

| Erro | Causa | Correção |
| --- | --- | --- |
| APK de teste mostrava a barra de endereço | `assetlinks.json` só tinha a chave do APK antigo; a chave nova não estava ligada (provado pela API do Google) | `assetlinks.json` com as duas chaves + `tests/assetlinks.test.js` (5 mutações pegas) |
| "Cancelar" da janela de denúncia não fechava | `data-back` só serve ao botão voltar do Android | Fechamento explícito + teste estático |
| Denúncia aceitava `reason` em lista | `String(['apelido'])` virava `"apelido"` | Só aceita texto |
| Rolagem lateral em 390 px nas páginas de privacidade e exclusão | E-mail longo sem quebra de linha | `overflow-wrap: anywhere` |
| CI vermelho no PR #55 | Faltou apagar `stitch.jpg` e a miniatura órfã (upload não apaga) | Apagados à mão; PR #56 |
| Teste de gemas falhou ao entrar a `012` | Lista fixa de migrações | Lista atualizada |
| (só do teste) capturas com "Só amigos podem ver" | Códigos de teste com `L` e `O`, fora do alfabeto de códigos | Códigos válidos nos dados de teste |
| (só do teste) cadastro barrado | Limite de 8 cadastros por IP em 10 min | IPs distintos nos testes |
| Entrega do zip sem arquivo para baixar | Esqueci de apresentar o arquivo | Sempre apresentar o arquivo ao entregar |
| CI vermelho no PR #59: `tests/seguranca-repositorio.test.js` (já existia na `main`) acusou "endereço de banco com senha" em `tests/sem-segredos.test.js` | Um exemplo inofensivo do meu vigia (um modelo de endereço de banco só com variáveis `${USER}`, `${PASS}` e `${HOST}`) casou com o padrão. **Nunca escreva, nem em documentação, um endereço de banco com usuário, senha e servidor seguidos, mesmo de mentira: monte o texto na hora.** **Não apareceu na verificação local porque eu aplicava o zip num clone sem registrar os arquivos no git, e esse teste só lê arquivos acompanhados (`git ls-files`)** | Exemplo montado na hora, em dois pedaços. Método corrigido: ver seção 9 |
| Senha fixa de teste (`Quebra!Cabeca#2026`) e token de mentira (`segredo-123`) escritos nos testes | Valores inventados, mas literais num repositório público (viram ruído em varredores e mau exemplo) | Gerados na hora com `crypto.randomBytes`; `tests/sem-segredos.test.js` impede a volta |
| Desbloquear a categoria paga **nova** dava erro 500 (só apareceu no teste em navegador real) | `006` fixou `CHECK (category_id IN ('cultura','fantasia'))` | Migração `013` + `tests/desbloqueio-categoria-nova-postgres.test.js` (compra, cobrança única sob cliques simultâneos, saldo curto, antigas e migração segura) |
| A própria `013` pulava a criação da chave estrangeira em um esquema temporário | `pg_constraint` é **global**: o nome já existia em outro esquema | Verificação restrita à tabela (`conrelid = 'library_unlocks'::regclass`) |
| (só do teste) 8 testes de PostgreSQL falharam com `ECONNREFUSED` | O banco local do meu ambiente cai de vez em quando | Reiniciar o banco e repetir; não é defeito do código |
| (só do teste) o 2º cenário reabria a sala do 1º | O app guarda a sala por até 3 h e volta sozinho para ela | Navegadores novos a cada cenário |
| (só do teste) `ERR_UNSAFE_PORT` | O Chrome bloqueia as portas 5060 e 5061 | Usar outras portas nos roteiros |
| Relato de "ímã fraco" na Sala Desafio | **Não era regressão**: o raio era 0,33 da casa desde o 1º commit (23/10) e as medições em navegador (versão de 31/10 e a atual, mouse e toque, Cooperativo e Desafio) deram o mesmo limite (encaixa até 0,31, recusa de 0,34). O encaixe nunca aconteceu durante o arrasto. Em 48 peças a folga era de só 16 px (em tela de 390 px). O que mudou em 31/10 foi visual (a peça fica pequena nas casas da borda até entrar inteira na grade) | O proprietário pediu um ímã mais forte: raio 0,5 (25 px em 48 peças, 61 px em 12). Reforço, não restauração: **não existe no histórico um valor anterior maior** |
| (só do teste) `busy` ao criar muitas salas | Limite de 12 salas por 10 min por IP (`ROOM_CREATES_PER_10MIN`) | Os testes que criam muitas salas sobem o servidor com `ROOM_CREATES_PER_10MIN=100` (só no teste) |
| A rota de compra da loja não dizia quantas gemas faltavam | O `bad()` padrão devolve só o código do erro | A rota devolve a resposta inteira (`gems`, `price`, `missing`) |
| Os efeitos de "peça retirada" das bandejas ficavam congelados | A regra que pausa animações no arrasto pegava também o efeito, que dispara no início do arrasto | A pausa vale só para as animações de ambiente |
| A cor de fábrica da Clássica e o amarelo puro eram "ajustados"/sumiam sob peça branca | Limite de claridade só por HSL | `safeTray()` também limita a luminância percebida e garante o contraste da borda |
| (só do teste) parecia haver compra sem confirmação | O harness (`shot_lib`) clica sozinho em `#cfm-ok` por padrão (`autoConfirm`) | Roteiros da loja usam `autoConfirm: false`; o app nunca confirma sozinho |
| (só do ambiente) disco cheio gravou um roteiro vazio | Muitos clones antigos de verificação | Apagar clones concluídos antes de clonar de novo; conferir o tamanho de arquivos gravados |
| Loja travava ao abrir (1,4 s num quadro) e ao rolar (CPU ~100%) | 5 prévias animadas na lista: ~61 animações = ~61 camadas de GPU; recorte arredondado e SVG aninhado repintados | Prévias estáticas em canvas, enfeites em grupos, pré-montagem, `content-visibility`, pausa ao rolar. Medido na `main` e na versão nova, CPU 4x: 1ª abertura 1400→133 ms; seguintes 83–233→17–33 ms; rolagem 4312→367 ms |
| Arrasto pesado | **Não era a bandeja**: 2 engasgos (~200 ms a CPU 4x) são do jogo: ao pegar a peça e ao ela entrar no tabuleiro e crescer (redesenho nativo do SVG recortado ao mudar a escala). Perfil JS: só 33 ms no JS | Reduzido o que era da loja (brilho 1 por toque, fora do toque, camada pré-criada, menos camadas): tempo perdido 339→239 ms (−30%). Os 2 engasgos do jogo ficam como pendência (ver riscos) |
| (só do teste) o brilho "adiado 160 ms" não ajudou | Só mudou o engasgo de lugar (dois em vez de um) | Revertido |
| (só do ambiente) o ambiente de trabalho foi reiniciado e apagou o trabalho não enviado | Sandbox reiniciada: sumiram `/home/claude`, o PostgreSQL e o navegador de teste | Commitar cedo e guardar um patch em `/mnt/user-data/outputs`; reinstalar com `apt-get update && apt-get install -y postgresql` (criar usuário `qc`/senha `qc` e banco `qc_test`) |
| (só do teste) testes do ímã ao arrastar instáveis ou falsos | **Armadilhas de geometria**: (1) peça na coluna da borda: "andar 1,2 casa para trás" é limitado pela borda do campo (`clamp`) e cai DENTRO da zona; (2) a ordem do Quebrando Cabeças é sorteada; (3) o trecho em linha reta da vaga/bandeja até o ponto de teste pode roçar a zona (o que o ímã faz por desenho) | Testar peças da coluna do meio, escolher o lado com espaço e aproximar na vertical até o ponto exato; rodar o arquivo 8x seguidas antes de aceitar |
| Macacão sumia no pet azul; capa e saia tímidas; chapéu vermelho de "festa" | Cor fixa por roupa; roxo parecido com o azul do corpo; camada de baixo da saia escondia a de cima | Cor escolhida por contraste com a skin (`pick`); capa mais larga; saia em dois andares; violeta escuro no chapéu. Ver as imagens, não só os testes |
| Pintinhas da skin quase invisíveis, ou parecendo "dentes" | Esferas enterradas numa superfície que curva para trás; fileira de pintinhas brancas logo abaixo da boca | Quase rentes à superfície e maiores; cores que não sejam branco na faixa de baixo |
| "Luar" (ex-"Meia-noite") igual ao pet azul; poses de braço iguais às existentes | O braço só gira até a vertical (não forma coração) e as poses "braços abertos" já eram de `tapSurprise`/`cheer` | Cor prateada; `admire` com as mãos juntas na frente e `heart` com braços abertos para a frente; ineditismo medido por distância de pose |
| Janela "Meu pet" cobria os pés do mascote | Parágrafo explicativo e botões altos | Janela compacta (o texto "fica só neste aparelho" foi para os Ajustes); teste: a base do mascote fica acima do topo da janela |
| Testes antigos do mascote reprovaram (armazenamento, `QC.openModal`, `preventDefault`) | Eram proteções reais da rodada original | Em vez de afrouxá-los, a janela e o armazenamento foram para `pet.js`; só se atualizaram a lista de scripts e a declaração dos grupos (`GROUPS_BASE`) |
| (só do teste) o roteiro do navegador testava a tela errada | Soltar o dedo no botão Loja abre a loja; `S.phone({ls})` reaplica o localStorage a cada carregamento | Fechar a loja antes de seguir; mudar o movimento reduzido pelos Ajustes, não regravando `qc.settings` |
| A escolha do visitante **sumia ao recarregar** | `loja.js` carrega antes de `mascot-looks.js`: na hora de validar a escolha guardada ainda não existiam ids de aparência, e ela era descartada | `QC.shopPet.ready()`, chamado pelo `pet.js` (último a carregar), relê o guardado; teste fixa a ordem dos scripts e a chamada |
| Textos ilegíveis no tema claro com o fundo marinho (21 achados) | Texto escuro direto sobre o fundo escuro (título do logotipo, categorias, nome da coleção, "Sala Desafio", cronômetro, textos da conta) | Tokens `--stage-ink`/`--stage-soft` nos elementos soltos; auditoria automática: 0 falhas em 596 medições (3 tamanhos × 2 temas × 8 telas) |
| (corrigido em `abas-tema`) O fundo marinho no tema CLARO desagradou: tela inicial, categorias e montagem deixaram de ser claras | Decisão do pacote `fundos` de usar palco escuro nos dois temas, a partir do JSON (que só tinha a versão escura) | Fundo gerado nas DUAS versões (`-claro.svg` e escura), escolhido por tema; os tokens `--stage-*` viraram apelidos das cores do tema; a auditoria passou a rodar nos dois temas |
| "Meus amigos" ilegível e Voltar diferente nas Amigos | Título com `--ink` (escuro) sobre o fundo escuro; botão `btn-ghost` | Com o fundo claro no tema claro o texto volta a ler; Voltar amarelo igual ao das categorias; auditoria passou a incluir a tela de Amigos com conta e amigo reais |
| A coleção abria já rolada depois de rolar as categorias | A rolagem do `#pick-scroll` ficava guardada ao trocar de vista | `pickScrollTop()` nas ações do jogador (não no `refreshLibrary`); o roteiro agora zera a rolagem antes de medir |
| "Sair da sala" mais baixo que os outros Voltar | `.lobby-inner { margin: auto 0 }` centraliza o conteúdo e o botão ia junto | Botão `position: absolute` no canto; `padding-top` de 56 px no conteúdo |
| (só da verificação) comando de teste passava de 300 s | Duas auditorias (3 tamanhos × 2 temas) no mesmo comando | Rodar um tema por vez |
| Cartões da aba Coleções passavam da tela (448 px em 360 px) com texto cortado | `contain-intrinsic-size: auto 420px` (um valor = largura e altura) + `content-visibility: auto` numa grade `auto` | `contain-intrinsic-height`, `minmax(0, 1fr)`, `min-width: 0`; teste proíbe a propriedade; ao medir, usar o retângulo de CADA elemento (a causa só apareceu medindo largura, não olhando o código) |
| Conquistas apareciam duas vezes (Perfil e aba do troféu) | O Perfil ganhou um resumo "Quase lá" numa rodada antiga | Removido; só a aba do troféu |
| Aquecer o canvas fazia a transição para Jogar piorar (1.016 contra 527 ms da `main`) | O `toBlob` "frio" (~660 ms a 1/4 da CPU) rodava na thread principal ao entrar nas categorias | Com o recorte no worker o aquecimento só vale em aparelho sem worker; o isolamento (ligado/desligado/`main`, 3 rodadas alternadas) é que achou isso, não o teste de uma versão só |
| Pré-carregar as capas parecia ajudar (744 → 400 ms) e piorou ao isolar (639 contra 550 ms) | A 1ª comparação misturava outras mudanças e tinha pouco tempo de espera; o ruído era maior que o efeito | Descartado. Regra: só aceitar um ganho que apareça isolado, com A/B alternado |
| Métrica "cauda do movimento do pet" dava 4 a 6 s para todas as reações | Piscadas e gestos ociosos também passam do limiar | Descartada; a decisão do pet veio da estrutura do laço (limite de 12 fps logo após `busy`) e da contagem de quadros nos 0,7 s seguintes |
| Medidor de quadros ainda mostrava 1,2 a 1,9 s na abertura com a thread principal ociosa | Pintura por software do 1º quadro do "VAMOS LÁ!" (o perfil mostra só 116 ms de tarefa longa) | Fora do controle do código; documentado. No celular com GPU deve ser bem menor, mas não foi medido |
| Borda de toque do botão voltar não respondia embaixo | O título animado (cria camada própria) ficava por cima da borda invisível de 7 px | `.pick-top { position: relative; z-index: 2 }`; o roteiro mede os 3 lados |
| `QCPecas.progresso` com total infinito desenhava 20 peças | `Number(x) || 0` deixa passar `Infinity` | `isFinite` antes; o teste cobre `NaN`, `Infinity`, `null`, texto e objeto |
| (só da auditoria) falsos alarmes: botão invisível `ABRIR`, lâmpada desativada, recepção da Sala Desafio "por baixo" da Loja | Elementos invisíveis/desativados e texto coberto por janela; o navegador de teste reentra sozinho na sala anterior | A auditoria ignora texto transparente, controle desativado e texto coberto (`elementFromPoint`) |
| Cereja igual ao Pôr do sol; Cartola e Mago com a mesma contagem de vértices; cartola "passando do topo" | Distância de cor 0,29 < 0,30; os dois usam cone; o teste tratava a tampa achatada como esfera inteira | Cor da Cereja mais rosada; cartola com outra malha; o teste agora mede a extensão real da esfera esticada e girada |
| "Comprar 💎 250" quebrava em duas linhas no cartão do pet | Cartão estreito (2 colunas) | `white-space: nowrap` e fonte menor nos botões do cartão |
| Roteiro do navegador esperava 7 itens bloqueados | Eram 8 (4 skins e 4 roupas pagas que sobram depois de comprar Limão e Bandana) | Conta feita à mão estava errada; corrigido o roteiro (o código estava certo) |

## 12. Pendências e riscos abertos (em ordem)

1. **Conta na Play e teste fechado de 14 dias** (caminho crítico; ninguém pode acelerar).
2. **Repositório hoje público, amanhã privado — segredos.** Varredura de 09/11/2026 em **todo o histórico** (305 commits, 54 ramificações, 57 referências de Pull Request) com gitleaks 8.30.1 e busca própria (Brevo, Neon, VAPID, Google, GitHub, chaves PEM, senhas): **nenhuma chave ou senha real**, nenhum arquivo de chave jamais enviado. Achados inofensivos e já corrigidos: duas senhas/tokens de mentira em testes. Credenciais `qc:qc@127.0.0.1` são do banco **temporário local do CI** (não são segredo). O e-mail de contato aparece nas páginas públicas **de propósito** (a Play exige). **Tornar o repositório privado não apaga o que já foi copiado**: clones e forks que existam, logs do GitHub Actions e comentários de PR ficam fora do alcance. Se um segredo algum dia entrar, **gire a chave no serviço de origem** (Brevo, Neon, Render) antes de qualquer outra coisa.
3. **ECA Digital (Lei 15.211/2025, em vigor desde 17/03/2026):** vale para serviços "de acesso provável" por menores de 18 anos, trata de aferição de idade e de vínculo a um responsável para contas de até 16 anos **em redes sociais**. O jogo não é uma rede social, mas tem amigos, convites e apelidos, e o cadastro só pede **autodeclaração** de 13+. **Levar a um profissional**; uma possível evolução é um modo supervisionado para 13 a 15 anos.
4. **Visual:** o mascote e as ilustrações são em desenho; a Play pode considerar que o app atrai crianças. Mitigado com 13+, textos sem linguagem infantil e capturas com fotos, não com a arte.
5. Fazer uma **denúncia de teste** entre duas contas do proprietário para provar que o e-mail chega pelo Brevo de verdade (só foi testado contra um Brevo simulado). Confirmar a quem pertence o remetente do Brevo (padrão do destino) ou definir `REPORT_NOTIFY_EMAIL`.
6. Conferir a **grafia do e-mail de contato** que aparece na política e na página de exclusão, e completar o nome do responsável pelos dados.
7. A capa da coleção **Cultura brasileira** mostra uma pessoa: confirmar origem e licença da imagem no catálogo.
8. Hospedagem gratuita que dorme; domínio `onrender.com` (trocar exige AAB novo); Neon gratuito.
9. Contas criadas antes da fase 13+ não passaram pela caixa "Tenho 13 anos ou mais".
10. O prazo de **15 dias** prometido na política e na página de exclusão precisa ser cumprido (ver `SEGURANCA.md`, seção 12, para revisar as denúncias).
11. **Estilo das imagens do Baú das Maravilhas:** desenho bem infantil (planetas, castelos de doces, dinossauros). Não há personagem de terceiros nem pessoa real, mas isso **pesa contra a declaração de 13+** na Play ("pode atrair crianças"). A autoria e os direitos são do proprietário (o catálogo registra a origem como "enviada pelo proprietário"). Nas capturas da loja, preferir as fotos da Fauna.
12. **Congelamento de ~2 s ao abrir a partida em celular lento (CPU 1/4):** é a montagem do tabuleiro e **já existia** (medido nas duas versões em 10/11: tempo perdido de 3033 e 3166 ms na versão anterior contra 2833 e 2733 ms na nova). Candidata a otimização futura (preparar a imagem antes da largada).
13. **Ímã mais forte = jogo um pouco mais fácil.** Com 0,5 a peça encaixa sempre que o centro dela estiver na metade interna da casa. Se os jogadores acharem fácil demais, baixe `SNAP_FACTOR` no Render (sem novo deploy de código). Valores medidos: encaixa até 0,49 e recusa a partir de 0,50 (12 peças); folga em tela de 390 px: 61 px (12 peças) e 25 px (48 peças).
14. **Economia das gemas:** os preços (150 a 500) são os pedidos pelo proprietário; como uma partida rende de 1 a 8 gemas e cada nível de 10 a 50, a Galáxia pede dezenas de partidas. Para mudar um preço, edite `shop.js` **e** o catálogo reserva em `public/loja.js` (o teste acusa se esquecer); o histórico guarda o preço pago.
15. **Bandeja além do campo:** em telas baixas (ex.: 360×640) e tablets o campo ocupa a altura toda e o "lábio" de 42 unidades fica parcialmente fora da tela. É só decoração, mas vale conferir no aparelho.
16. **Play Store:** a loja usa só moeda do jogo ganha jogando; não há compras no app. Manter assim (vender gemas exigiria o faturamento da Play e nova política).
17. **Os 2 engasgos do arrasto são do jogo (pendente, decisão do proprietário):** ao pegar a peça (~200 ms a CPU 4x) e ao entrar no tabuleiro e crescer (`targetScale`/`p.vs` mudam a cada quadro e o SVG de cada peça é redesenhado). Nenhum ajuste de CSS testado ajudou (transition, `will-change`, `contain`, `shape-rendering`, pré-promover camadas). A saída é mudar o crescimento (crescer de uma vez ou manter um tamanho no arrasto), o que altera uma sensação já aprovada: só com teste no celular. Medir sempre com `Performance.getMetrics` e quadros >40 ms, **alternando** as versões (o ruído é grande).
18. **Medições com navegador sem GPU:** o navegador de teste desenha por software; os números absolutos são mais pessimistas que um celular real. Valem para **comparar** versões. A primeira abertura da loja ainda tem um primeiro desenho mais pesado; confirmar no aparelho.
19. **Ímã ao arrastar deixa o jogo mais fácil e pode puxar uma peça que o jogador só queria passar por cima da casa.** A zona é a do `SNAP_FACTOR` (0,5 da casa). Se os jogadores reclamarem: `SNAP_FACTOR` menor (ex.: 0,4) ou `DRAG_MAGNET=0`. A peça só é puxada pela PRÓPRIA casa (nunca por outra) e só se o giro for 0 (sempre é).
20. **Atraso do puxão:** quem decide é o servidor: a posição sai do celular a cada ~50 ms e a resposta volta pela rede (Render: ~100–200 ms), então a peça pode andar um pouco mais com o dedo antes de ser puxada; a animação até o centro usa o laço de quadros do cliente. No navegador de teste (rede local) a peça foi puxada na borda da zona (0,48 da casa). Confirmar a sensação no celular.
21. **Skins e roupas são grátis e locais (decisão do pacote):** não entram na loja nem na conta, não sincronizam entre aparelhos. Se um dia viraram itens da loja, reaproveitar `shop.js` (catálogo + compra atômica) e guardar a escolha em `shop_prefs`; os ids e `sanitize` já são estáveis.
22. **Segurar o dedo (650 ms) no pet é um gesto novo e não foi testado em Android real:** o WebView pode abrir menu de contexto/seleção em toques longos. Se acontecer, o carinho pode ir para outro gatilho (por exemplo, toque duplo). No navegador de teste (mouse) funciona.
23. **Custo do desenho:** roupas e pintas somam até ~14 chamadas por quadro. Medido com a CPU 4× mais lenta: ~+1 ms por quadro (5,3–7,3 ms sem roupa; 6,5–7,9 ms com), sem rebaixar a qualidade adaptativa. Qualquer roupa nova precisa respeitar os limites testados (3 malhas, 2.500 vértices, 8 peças) e caber na câmera.
24. **Poses de braço têm limite físico:** `armL/armR` só vão até a vertical (3,1 rad); não dá para formar um coração sobre a cabeça. Reações novas devem ser medidas contra as existentes (distância de pose) e vistas em imagem antes de aprovar.
25. **Preços sem referência de ganho:** os valores das skins e roupas (100 a 600) foram definidos sem saber quantas gemas um jogador ganha por partida. Medir o ritmo real antes de mexer; mudar um preço vale só para compras futuras (o histórico guarda o preço pago) e a raridade acompanha sozinha.
26. **Visitante que cria conta:** a escolha de pet de visitante (`qc.pet`) NÃO é copiada para a conta no primeiro login; a conta começa com o pet de fábrica (o servidor manda). Se incomodar, enviar a escolha grátis do visitante na primeira vez que o servidor responder vazio.
27. **Miniaturas fora do cache offline:** `public/pet/*.webp` não estão no `SHELL` do service worker (20 arquivos, ~120 KB). Sem internet o cartão mostra um ícone no lugar da foto; a compra e o equipar já precisam de internet de qualquer jeito.
28. **Compra de gemas com dinheiro (futuro):** fora do escopo, de propósito. Quando vier, ela só precisa creditar `users.gems`; a loja já gasta apenas desse saldo.
29. **(superado em `abas-tema`)** O fundo agora acompanha o tema. O que continua valendo: o JSON só descrevia a versão escura; a versão clara é uma adaptação (degradê lavanda de antes, luzes e peças pastel) e não tem aprovação de um desenho original.
30. **O JSON só descrevia o visual:** o PNG/SVG de origem (`fundo_sala_desafio_720x1600.png`) não veio; os fundos foram reconstruídos da especificação (cores, luzes e peças do JSON). As peças usam a forma de peça do próprio jogo (`pecas.js`), não a do arquivo original.
31. **Janelas só ganharam peças tênues:** a folha de cada janela continua sendo a do tema (clara ou escura); só `.sheet` recebe as peças. Janelas pequenas (confirmações) mostram quase nada das peças, de propósito.
32. **Auditoria de contraste não está no CI** (precisa de navegador): os roteiros `telas_auditoria.js`, `telas_cabecalho.js` e `telas_fotos.js` ficam fora do repositório, na pasta de testes de navegador. Rodar antes de qualquer pacote que mexa em cor, tela ou cabeçalho (estados não cobertos: conta logada com abas, estados de erro).
33. **A barra de abas só existe na tela inicial.** Categorias, coleções, Sala Desafio e Amigos têm o Voltar no canto; se o jogador esperar a barra em todas as telas (como no Instagram), é preciso decidir se ela vira navegação global (e o que `Amigos` abre dentro de cada tela).
34. **Android real e teclado:** a barra é `position: fixed` e usa `env(safe-area-inset-bottom)`; não foi testada com o teclado aberto nem em Android com barra de gestos. Na tela inicial o único campo de texto (código da sala) fica acima da barra; se o teclado a empurrar para cima do campo, reavaliar.
35. **Nada disto foi medido em celular real.** Todos os números vêm de navegador sem GPU com a CPU a 1/4. Em Android, o recorte no worker deve ajudar mais (a CPU do celular é o gargalo), mas a pintura por GPU pode mudar onde estão os engasgos. Antes de mexer de novo, medir no aparelho (Chrome remoto: `chrome://inspect`, aba Performance).
36. **Suporte ao worker:** precisa de `OffscreenCanvas` 2D com `convertToBlob` (Chrome/Edge/Android atuais, Firefox 105+, Safari 16.4+). Fora disso usa o caminho antigo (mais lento na abertura, igual ao de antes). O worker não está no cache offline do aplicativo instalado? Está (`/crop-worker.js` no `SHELL`); se falhar offline, também cai no plano B.
37. **`will-change` em todas as peças:** com 48 peças são 48 camadas, mas elas já eram camadas por causa do `translate3d`; o custo extra de memória é desprezível, mas num aparelho muito fraco vale conferir o uso de memória da partida de 48 peças.
38. **Conquistas dentro de cada coleção:** a aba Coleções ainda repete, em cada cartão, as conquistas da coleção (a lista completa está na aba do troféu). Foi mantido porque o pedido tratava só do Perfil; se ficar repetitivo ou longo, trocar por um resumo ("2/4 conquistas") com um toque que leve à aba do troféu.

## 13. O que NÃO foi verificado

Nenhum teste em Android real (nem do APK, nem do AAB); o primeiro envio à Play; os nomes exatos das telas do Play Console; o comportamento do Chrome após a mudança do vínculo (cache de até 1 hora); o e-mail de denúncia com o Brevo de verdade; a região dos servidores do Render e do Neon (a política diz "em geral nos Estados Unidos"); o parecer jurídico sobre o ECA Digital.

---

# HISTÓRICO ANTERIOR PRESERVADO

(Notas das rodadas até 31/10/2026, mantidas exatamente como estavam. Podem estar desatualizadas; em caso de conflito, vale a seção acima.)

# CONTINUIDADE — CORREÇÃO DO ENCAIXE COM ANIMAÇÕES REDUZIDAS

**Data:** 31/10/2026 (America/Fortaleza). **Base oficial da `main` confirmada:** `6e02e45606419cbb6198d0abeceaddc9553fd0de` (Merge do PR #37, "Corrigir zoom estável"). Verificados no GitHub os blobs de `public/game.js`, `public/style.css` e `CONTINUIDADE.md` antes de alterar. A implementação parte da árvore atual, sem substituir por cópias de PRs antigos. O assistente não escreve no GitHub nem faz deploy.

## Relato e investigação

O proprietário observou que **desativar as animações em Ajustes** torna o encaixe menos fluido e causa pequenos travamentos. Foram conferidos os PRs #31 (arrasto de seis peças), #32 (grade em todas as quantidades), #33 (reversão), #34 (orientação/ajudas), #35 (fluidez), #36 (grade completa) e #37 (zoom estável). Os três últimos alteraram a dinâmica de seleção/escala, mas não removeram do caminho de encaixe operações de layout síncronas preexistentes.

**Evidências do código original da `main`:**

- `socket.on('locked')` encerra o arrasto e chama `checkMilestones()`. Ao atingir 25%, 50% ou 75% do progresso, `showMilestone()` executava `void el.offsetWidth` para reiniciar a animação *mesmo com movimento reduzido*. Isso força uma leitura síncrona de layout durante o encaixe.
- `popEl()` (feedback em botões, caixa de presentes e outras interações) e `shake()` também forçavam `offsetWidth` mesmo se os efeitos visuais estivessem desativados.
- A regra de CSS `.piece.locked .tile { animation: pop .35s ease-out }` continuava criando uma animação; no modo reduzido a regra universal encurtava a duração para `.01ms`, mas não removia a animação.
- O `frame()` continuava interpolando a escala de uma peça **já encaixada** mesmo em modo reduzido. A posição final do SNAP estava correta no servidor; contudo, o cliente podia continuar desenhando quadros para completar a escala visual já finalizada.

Esses pontos reproduzem **trabalho visual desnecessário** no modo reduzido e explicam uma origem plausível de engasgos; não afirmam diagnóstico de FPS no Android sem medição no aparelho. Os testes isolados adicionados falham em 5 dos 10 casos na versão anterior e passam integralmente com a correção.

## Mudanças mínimas

1. **`public/game.js`:** `showMilestone()`, `popEl()` e `shake()` não medem `offsetWidth` quando `reducedMotion()` é verdadeiro. Os estados visuais, mensagens, som, limpeza por timeout e animações normais permanecem.
2. **`public/game.js`:** no quadro de um encaixe confirmado, **somente se as animações estiverem reduzidas** e a peça ainda não estiver na escala final, `p.vs` vai imediatamente ao tamanho final e `scaleAnimTime` é encerrado, sem gerar RAF adicional pela escala. Arrasto, expansão da peça antes do encaixe e pinça conservam a lógica do PR #37.
3. **`public/style.css`:** a animação temporária `pop` da peça encaixada é realmente desabilitada em `data-motion="reduce"` **e** quando o sistema operacional solicita movimento reduzido. Com animações ligadas, a animação atual permanece.
4. **`tests/animacoes-reduzidas-encaixe.test.js`:** novo teste com funções reais avaliadas em `vm`, cobrindo reflows, encaixe visual, movimento padrão, preservação de eventos e contratos. A documentação histórica é mantida nesta seção do `CONTINUIDADE.md`.

**Arquivos exatos do pacote (4):** substituir `public/game.js`, `public/style.css` e `CONTINUIDADE.md`; adicionar `tests/animacoes-reduzidas-encaixe.test.js`.

**Não alterar:** `server.js`, `challenge.js`, ambos os `tryLock`/SNAP, eventos Socket.IO, `accounts.js`, `xp.js`, `gems.js`, segurança, banco/Neon, migrações SQL imutáveis, `public/sw.js` (cache `v21`, atualização automática da PWA), imagens, sons, layout/HTML, ajuda 💡/📍, proteção de crianças e frases prontas. Solo/Coop conservam orientação zero; Sala Desafio conserva giros. XP permanece exclusivamente em `payMatch`.

## Testes e limites

- Os 10 testes de regressão novos **falharam em 5** sobre a versão original (falhas específicas de reflow/transição/efeito) e **passaram 10/10** com a correção.
- Chromium headless de desktop: testados tamanhos **6, 12, 20, 30 e 48** em modo normal, movimento reduzido no app e preferência reduzida do sistema, verificando as propriedades CSS computadas (`animation-name`), o tamanho final da peça e a ausência de quadros extras no modo reduzido; 15 cenários passaram. Não é teste de Android físico nem medição de FPS.
- Testes sintáticos e regressões do projeto registrados separadamente nesta rodada; relatórios detalhados ficam nos logs locais de preparação, não no ZIP distribuído.
- **Não testados:** latência real de um Android, sala cooperativa real em dois aparelhos, Socket.IO integrado, PostgreSQL real, Render, deploy e GitHub Actions desta nova branch. O proprietário fará o teste após PR, Merge e deploy, como de costume.

## Publicação e aprovação

Conferir a `main` novamente antes do envio; a base esperada é `6e02e45`. Criar **nova ramificação** (sugestão: `corrigir-encaixe-sem-animacoes`), carregar **somente os 4 arquivos** mantendo suas pastas, abrir PR para `main`, verificar `Files changed` e os workflows de regressão PostgreSQL isolado e segurança. O proprietário faz Merge e Manual Deploy no Render. Fechar e reabrir a PWA instalada **sem apagar dados**, voltar à tela inicial para permitir atualização do cache quando necessário. Testar em Android todos os tamanhos Solo/Coop e ambos os modos da Sala Desafio, principalmente encaixes nos marcos de 25%, 50% e 75%, primeiro com animações desligadas e depois ligadas; conferir arrasto, crescimento único na grade, encaixe, zoom por pinça, orientação correta, ajudas e continuidade da partida. Somente depois do retorno/validação iniciar nova rodada.

---

# CONTINUIDADE — ZOOM ESTÁVEL APÓS ENTRADA NA GRADE E ARRASTO MAIS SUAVE

**Data:** 31/10/2026 (America/Fortaleza). **Base `main` confirmada antes da alteração:** `9d8ed2dbb3c4129afdf22c1b13e620b0f54fede0` (Merge PR #36 — corrigir escala grade completa). Conferidos os blobs Git da `main` para `public/game.js` (`d09bd3110e4cb19c87f60b1ba89cdae2bcb9ade3`), `CONTINUIDADE.md` (`0daf2193f7d5f56479ae6575540cd5a0b6d1ac76`) e `tests/escala-grade-completa.test.js` (`a98e558238b64db2861989eeac43ba6de7a3c615`); são idênticos ao pacote PR #36 aplicado sobre a cópia de trabalho. **Nenhuma escrita no GitHub/Render foi realizada pelo assistente.**

## Sintoma reportado e causa identificada

Depois de uma peça entrar inteiramente no tabuleiro e crescer, o zoom diminuía ao passar um pouco das bordas e podia aumentar de novo. A antiga `baseScale()` recalculava o alvo entre `1` e `TRAY/TILE` em todo quadro usando somente `fullyInsideBoard(p)`; qualquer oscilação de posição por frações de pixel alterava o alvo e revertia a animação.

## Correção localizada

- **`public/game.js` / `baseScale(p)`:** `fullyInsideBoard(p)` continua definindo a **primeira** entrada completa no tabuleiro. Ao entrar, `p.boardExpanded` registra o aumento. A partir daí, o tamanho final (`1`) é mantido ao arrastar perto das bordas, sem oscilar. O estado só volta a pequeno **após soltar a peça na área da bandeja**, abaixo de `TRAY_LINE + TRAY/2`; se ainda estiver sendo segurada, permanece grande. Peças já encaixadas continuam sempre em escala `1`. Cada nova sala cria estado independente (`boardExpanded: false`). O tamanho inicial de bandeja fica inalterado para 6/12/20/30/48 peças.
- **`public/game.js` / `frame(now)`:** escala passa de interpolação fixa de 30% por quadro para *easing* por tempo decorrido (constante de 82 ms para expansão natural e 48 ms para zoom por pinça), com intervalo limitado a 8–48 ms para manter comportamento estável em telas de diferentes frequências e após pausas. A animação **continua a expandir gradualmente**; não muda o movimento `x/y` que acompanha o dedo, nem introduz desenhos contínuos quando parado.
- **`tests/escala-grade-completa.test.js`:** regressões para as cinco quantidades, bordas com flutuações de 0,1 a 0,6 px sem encolher, volta à bandeja somente após soltar, nova entrada, suavidade em 30/60/120 Hz e preservação de pinça, arrasto, SNAP e giros.

**Arquivos exatos do pacote (3):** `public/game.js` (substituir), `tests/escala-grade-completa.test.js` (substituir) e `CONTINUIDADE.md` (substituir). **Não alterar:** `public/sw.js` (cache v21 atualiza os recursos de forma automática), `public/style.css`, HTML, imagens, `server.js`, `challenge.js`, Socket.IO, ambos `tryLock`/SNAP, banco/Neon, migrações SQL imutáveis, contas, XP (`payMatch`), gemas, ajudas fixas, sons, frases prontas ou privacidade de outros jogadores. Solo/Coop continuam com rot=0 e Sala Desafio mantém giros.

## Testes executados e limitações

- `node --check public/game.js` e `node --check tests/escala-grade-completa.test.js`: **aprovados**.
- Quatro suítes específicas (escala da grade, arrasto de seis peças, fluidez e giros/ajudas): **58 aprovados, 0 falhas**.
- Suíte sem quatro arquivos de integração que exigem `socket.io-client`: **144 testes, 142 aprovados, 0 falhas, 2 ignorados** (dependem do PostgreSQL real).
- `npm test` completo **tentado, mas não aprovado localmente**: quatro testes de integração não conseguiram carregar `socket.io-client` neste ambiente. Necessário validar `npm ci` e `npm test` no GitHub Actions.
- Chromium headless de desktop com SVG e CSS do jogo, testando 6/12/20/30/48: crescimento até `1`, retenção do tamanho ao cruzar 0,5 px da borda e pinça manual: **aprovado**. Não é medição de FPS nem uso em Android físico.
- **Não testado:** FPS, suavidade real, toque e sincronização em Android físico/duas contas, Render, Neon real, e GitHub Actions deste novo PR. Os testes automatizados não substituem a aprovação no celular.

**Publicação pelo proprietário:** criar uma **nova branch** partindo da `main` reconfirmada, enviar somente os três arquivos acima nos caminhos indicados, abrir PR, exigir ambos workflows de regressão e segurança aprovados, fazer Merge e Manual Deploy no Render. Fechar e reabrir a PWA sem limpar dados; confirmar atualização ao voltar à tela inicial. No Android testar todos os cinco tamanhos em Solo/Coop, arrastar junto à borda depois de crescer (não encolher), voltar à bandeja e soltar (ficar pequeno), voltar à grade (crescer suavemente), zoom por pinça e giro nos dois modos da Sala Desafio. **Aguardar a validação do proprietário antes de iniciar nova rodada.**

---

# CONTINUIDADE — TAMANHO NATURAL ATÉ ENTRAR INTEIRAMENTE NA GRADE (PR #35 PRESERVADO)

**Data:** 31/10/2026 (America/Fortaleza). **Base confirmada na `main`:** `7ea674bd081aee8f9df99c07a0805a51ddbdaad3` (Merge PR #35 — corrigir fluidez do arrasto). Arquivos do ZIP #35 usados como base após confirmar hashes Git de `public/game.js`, `CONTINUIDADE.md` e testes; conferido também `public/sw.js` e estrutura do ZIP oficial anterior. A implementação do pacote anterior do PR #32 foi usada apenas como **referência da regra visual**, não como substituição da `main` nem para restaurar a regressão revertida pelo PR #33.

## Comportamento restaurado com correção mínima

- **Todos os tamanhos: 6, 12, 20, 30 e 48** — a peça mantém o tamanho pequeno de bandeja durante toque, seleção e arrasto fora da grade. A peça atinge seu tamanho completo apenas quando a **área nominal inteira de TILE × TILE** cabe no tabuleiro (`BOARD_X/Y/W/H`), inclusive bordas. O crescimento/redução é progressivo pelo `frame()` já existente, sem ampliar ao segurar nem reintroduzir `HELD_SCALE`.
- `public/game.js`: adicionada `fullyInsideBoard(p)` como teste geométrico barato, sem DOM, desenho SVG adicional, redes/canvas/leituras de layout. `baseScale()` passa a usar esse teste ou `TRAY/TILE`. Ajustado o deslocamento inicial de `onPointerDown()` sem compensação de zoom automático: o dedo acompanha a peça sem salto; a medição de campo ANTES da seleção, o `refreshLamp()` leve, os 5 px Solo/Coop, os 8 px Desafio e a pausa de RAF no repouso do PR #35 permanecem.
- **Solo e Cooperativo** seguem com todas as peças iniciando na orientação correta (`rot=0`, definido pelo `server.js` atual). **Sala Desafio Comum e Quebrando Cabeças** seguem com seus giros e funcionamento próprio, sem mexer em `server.js`/`challenge.js`. Zoom manual por pinça preservado e independente da regra automática.
- **Não alterar:** SNAP/duas `tryLock`, Socket.IO, servidor, HTML, CSS, sombras, imagens, sons, animações de vitória, contas, XP (só `payMatch`), gemas, PostgreSQL, migrações, frases prontas e privacidade. `public/sw.js` permanece no cache `v21`, cujo `refreshShell()` verifica atualizações automaticamente ao abrir o app e aplica no início sem limpar dados locais.

## Arquivos exatos para nova ramificação / PR (4)

| Caminho no repositório | Operação |
|---|---|
| `public/game.js` | substituir |
| `tests/arrasto-seis-pecas.test.js` | substituir (expectativas da escala) |
| `tests/escala-grade-completa.test.js` | adicionar (todas as quantidades, geometria, gesto, pinça, interpolação e contratos) |
| `CONTINUIDADE.md` | substituir (este registro no início; histórico intacto) |

## Testes, limites e publicação

- `node --check` para `public/game.js`, `tests/arrasto-seis-pecas.test.js` e `tests/escala-grade-completa.test.js`: **aprovados**.
- `node --test` das quatro suítes específicas (arrasto de seis peças, novo teste de grade completa, fluidez do PR #35 e giros/ajudas): **51 aprovados, 0 falhas**.
- `node --test` dos arquivos de regressão sem dependências de Socket.IO externas: **137 testes, 135 aprovados, 0 falhas, 2 ignorados** (PostgreSQL real indisponível).
- Suíte completa executada localmente, mas **não aprovada** neste ambiente: **141 testes, 135 aprovados, 4 arquivos de integração falharam no carregamento por ausência do módulo npm `socket.io-client`, 2 ignorados**. A instalação das dependências não foi concluída neste ambiente; GitHub Actions deve executar `npm ci` e `npm test` antes do Merge.
- Chromium headless de desktop: verificados os cinco tamanhos com SVGs representativos e CSS do repositório, transição de tamanho ao cruzar a borda e zoom manual; **não é benchmark de FPS Android nem partida real**. O servidor e demais arquivos da base foram conferidos contra blobs da `main` por SHA; o ZIP foi validado antes da entrega.
- **Não testados aqui:** FPS Android físico, toque real em PWA/APK, dois celulares simultâneos, Render, Neon real, GitHub Actions deste novo PR. O proprietário valida esses itens após Merge e Manual Deploy.
- Criar branch NOVA a partir da `main` no SHA acima, enviar os 4 arquivos nas pastas indicadas, abrir PR, verificar os workflows de regressão/segurança, fazer Merge e Manual Deploy pelo proprietário. Não enviar arquivos diretamente à `main`. Após a atualização automática da PWA, testar 6/12/20/30/48 em Solo/Coop, peças pequenas até a grade, progressão do tamanho, sem engasgos, pinça e ambos os botões de ajuda; Sala Desafio deve continuar permitindo giro.

---

# CONTINUIDADE — SELEÇÃO E ARRASTO MAIS RESPONSIVOS (RODADA DE CORREÇÃO)

**Data:** 31/10/2026 (America/Fortaleza). **Base real da `main` verificada antes das alterações:** `276c2882675ab3e111ad28c2f39b7e236012f2cd` (Merge PR #34 — giro somente no Desafio e ajudas fixas). O ZIP recebido foi comparado pelos hashes de blob Git de `public/game.js`, `public/sw.js`, `CONTINUIDADE.md` e testes relevantes: arquivos idênticos aos da `main`. Não houve escrita no GitHub ou deploy pelo assistente.

## Objetivo e alterações mínimas

Reação mais rápida ao selecionar e arrastar peças no Android, sem alterar encaixes, aparência, escala, imagens, sombras, sons, gestos de pinça ou giro exclusivo da Sala Desafio.

1. **`public/game.js`:** `onPointerDown()` mede `#field` com `getBoundingClientRect()` **antes** de modificar classes de seleção; evita forçar uma leitura de layout após essas escritas. A medida e o cálculo de deslocamento do dedo mantêm as fórmulas anteriores.
2. **`public/game.js`:** selecionar, soltar ou concluir um gesto chama apenas `refreshLamp()` para atualizar disponibilidade/contadores das ajudas, sem redesenhar o placar e os avatares por `updateHud()` a cada toque. Atualizações reais de placar, finalização, metadados e giro no Desafio ainda usam os caminhos antigos.
3. **`public/game.js`:** no **Solo e Cooperativo**, o arrasto por toque começa após **5 px** de deslocamento também com 12/20/30/48 peças; o tamanho 6 já usava 5 px. A **Sala Desafio** preserva o limiar de **8 px** para 12/20/30/48 e o anterior de 5 px para 6, permitindo distinguir toques de girar. O zoom por pinça e a escala automática nos demais tamanhos permanecem iguais.
4. **`public/game.js`:** enquanto o dedo permanece parado durante o arrasto, `frame()` deixa de pedir quadros RAF extras *somente* por `dragging`; cada evento `pointermove` continua chamando `wakeFrame()` para exibir a posição atual imediatamente. Transições de escala, movimento remoto e animações existentes ainda acordam quadros quando necessário. Envio de `move/ch:move` permanece a cada 50 ms no máximo.
5. **`tests/arrasto-seis-pecas.test.js`, `tests/giro-infantil-ajudas.test.js`:** atualizados apenas para as expectativas do novo limiar e a atualização restrita às ajudas. **`tests/arrasto-fluidez.test.js`:** novo, com sete regressões executando métodos reais do cliente por `vm` e simulações de gestos, RAF, rede e DOM.

## Arquivos exatos do ZIP (5)

| Caminho dentro do repositório | Ação |
|---|---|
| `public/game.js` | substituir |
| `tests/arrasto-seis-pecas.test.js` | substituir |
| `tests/giro-infantil-ajudas.test.js` | substituir |
| `tests/arrasto-fluidez.test.js` | adicionar |
| `CONTINUIDADE.md` | substituir (registro atual acrescentado, histórico anterior intacto) |

**Não alterar:** `server.js`, `challenge.js`, `accounts.js`, contas, XP/gemas, migrações, imagens, estilos, sons, HTML, outros testes e banco. **`public/sw.js` permanece em `v21`:** seu `refreshShell()` já busca a versão mais recente de `/game.js` ao abrir a PWA, comunica `shell-updated` e o cliente recarrega **somente na tela inicial**. Não mudar o cache nesta rodada evita mexer em cinco testes e no service worker sem necessidade. Fechar e reabrir o aplicativo após o deploy; se necessário, voltar à tela inicial para aceitar atualização, sem limpar dados.

## Testes efetivamente executados

- `node --check` dos quatro arquivos JS incluídos: **aprovado**.
- `node --test` para os testes de arrasto, giros/ajudas e fluidez: **24 executados, 24 aprovados, 0 falhas**.
- `node --test` dos **19 arquivos independentes de integração externa**: **110 executados, 108 aprovados, 0 falhas, 2 ignorados** (dependem de PostgreSQL real).
- `npm test` completo foi **tentado, mas NÃO passou integralmente neste ambiente**: **114 testes, 108 aprovados, 4 falhas por falta do pacote `socket.io-client` e 2 ignorados**. A tentativa de instalar dependências com `npm ci` não terminou por indisponibilidade do acesso ao registro npm. Os 4 testes não foram validados aqui; devem rodar no GitHub Actions.
- **Não executados:** servidor Express/Socket.IO integrado, PostgreSQL real, `npm test` completo aprovado, GitHub Actions do novo PR, Render, APK/PWA instalada, medições de FPS e teste Android físico. O comportamento visual e a melhora de FPS precisam ser confirmados pelo proprietário no celular.

## Publicação e verificação no Android

1. Antes de enviar o pacote, confirmar que a `main` ainda está em `276c288`; caso haja novo merge, reavaliar conflitos antes de substituir arquivos.
2. Criar **uma ramificação nova da `main`**, por exemplo `corrigir-fluidez-arrasto`; enviar exatamente os 5 arquivos nas pastas indicadas. Abrir PR para `main` e verificar que `Files changed` tem os cinco itens. Esperar os dois workflows (incluindo PostgreSQL isolado) terminarem com sucesso; somente o proprietário faz Merge, Manual Deploy no Render e validação no Android.
3. Após o deploy, fechar e reabrir o aplicativo; se aparecer atualização, aplicá-la na tela inicial. No Solo e Cooperativo, testar 6, 12, 20, 30 e 48 peças, iniciando arrasto, soltando, encaixando, selecionando novamente e usando o zoom por pinça. Conferir ambas ajudas fixas e contadores.
4. Na Sala Desafio Comum e Quebrando Cabeças, confirmar giro pelo segundo toque, arrasto e encaixe, sem regressões. No Cooperativo, validar em dois aparelhos a movimentação remota e a conclusão sem perda de conta. Aprovação somente após o relato do teste real feito pelo proprietário.

**Não iniciar outra rodada até essa aprovação.**

---

# CONTINUIDADE — GIRO SOMENTE NA SALA DESAFIO E DUAS AJUDAS FIXAS

**Data:** 31/10/2026 (America/Fortaleza). **`main` oficial verificada antes da edição:** `88a9011578dcdccd4b5838c6f8a544505762822d` (Merge PR #33 — reversão da ampliação/arrasto do PR #32); árvore `4b30e9423eb3fb7d37b9c6539d2555ca7c744774`. **Implementação preparada localmente para nova branch e PR.** O assistente não escreve no GitHub nem faz deploy. Nenhuma alteração do arrasto/escala que tinha causado travamento foi retomada.

## Pedido aprovado

1. **Solo e Cooperativo (6, 12, 20, 30 e 48 peças):** peças devem nascer sempre orientadas para o encaixe (rot=0), sem necessidade nem possibilidade de giro ao tocar novamente. A seleção, soltar, arrastar, encaixar e o zoom por pinça continuam. A Sala Desafio mantém os giros nos seus dois modos: **Comum** e **Quebrando Cabeças**. A indicação `↻`, a seta de orientação e a etapa de tutorial de girar ficam ocultas apenas nas partidas normais.
2. **Ajudas sempre lado a lado:** 💡 continua mostrando a imagem esmaecida no tabuleiro por 4 segundos, e 📍 continua mostrando a casa correta de uma peça selecionada. Em vez de transformar um mesmo botão ao selecionar, manter **dois botões independentes e fixos** com saldos próprios (10 e 5 por partida, conforme servidor). O botão 📍 fica visível, mas desabilitado enquanto nenhuma peça válida estiver selecionada. Os destaques acesos, os contadores e os bloqueios temporários são separados. Preservar ambas também na Sala Desafio.

## Alterações mínimas

- **`server.js`:** `buildPieces(cfg, readyToFit=false)` preserva rotações aleatórias para chamadas da Sala Desafio (`buildPieces(cfg)`), enquanto o criador e o recomeço de salas normais chamam `buildPieces(cfg,true)`, gerando todas as peças com `rot=0`. `acc:continue` também se beneficia do criador normal. O evento antigo `rotate` continua registrado para compatibilidade com clientes em cache, mas não altera a orientação no Solo/Coop e apenas confirma `rot=0`; sem tentar encaixe por giro. Nenhuma mudança nas duas funções `tryLock`, no SNAP nem no `challenge.js`.
- **`public/game.js`:** toque repetido solta a peça no Solo/Coop, mas gira na Sala Desafio; teclado `R` e símbolo `↻` só no desafio. Tutorial normal pula a cena de giro; tutorial do desafio preserva essa cena. A marca de direção da peça fica oculta fora da Sala Desafio. O gesto de pinça, arrasto e escala permanecem exatamente como no PR #31.
- **`public/index.html`, `public/style.css`, `public/game.js`:** botões 💡 e 📍 distintos em grupo horizontal fixo, com contadores, ações, bloqueios e destaques separados; cabeçalho ajustado responsivamente a partir de 320 px sem ocupar uma segunda linha. Ajudas se ocultam juntas na tela da partida concluída para deixar espaço ao X. Tutorial de ajudas atualizado.
- **`public/sw.js`:** atualização do cache PWA `v19` para **`v21`** (pulando `v20`, que já havia sido usado pelo PR #32 revertido), evitando reutilizar cache antigo problemático na PWA. Os cinco testes de cache acompanham `v21`.
- **Testes existentes:** `tests/coop.test.js`, `tests/solo.test.js`, `tests/rotacao-visual.test.js`, `tests/contratos.test.js` atualizados para a orientação correta e ações sem rotação no normal, mantendo exigências antigas do SNAP e eventos. **Novo:** `tests/giro-infantil-ajudas.test.js`, com testes isolados da construção, modo Desafio, proteção contra giro legado, seleção, dicas independentes e tutorial. Outros testes antigos de cache seguem inalterados fora da constante.

## Arquivos exatos do pacote (16)

| Caminho no repositório | Operação |
|---|---|
| `server.js` | substituir |
| `CONTINUIDADE.md` | substituir (este registro no topo; histórico preservado) |
| `public/game.js` | substituir |
| `public/index.html` | substituir |
| `public/style.css` | substituir |
| `public/sw.js` | substituir |
| `tests/arrasto-seis-pecas.test.js` | substituir (cache) |
| `tests/colecoes-galeria.test.js` | substituir (cache) |
| `tests/fluidez-animacoes.test.js` | substituir (cache) |
| `tests/library-visual.test.js` | substituir (cache) |
| `tests/sem-piscadas.test.js` | substituir (cache) |
| `tests/coop.test.js` | substituir (expectativas de giro e encaixe) |
| `tests/solo.test.js` | substituir (expectativas de giro e encaixe) |
| `tests/rotacao-visual.test.js` | substituir (giro só no desafio) |
| `tests/contratos.test.js` | substituir (ajudas juntas desaparecem após vitória) |
| `tests/giro-infantil-ajudas.test.js` | adicionar |

**Não alterar:** `challenge.js`, contas, autenticação, banco, migrações, `xp.js`, `gems.js`, `security.js`, `resource-guard.js`, imagens, sons, versões antigas no Render ou outros recursos. Preservados eventos do Socket.IO (inclusive `rotate` e `ch:rotate`), duas cópias de `tryLock`/SNAP, XP só via `payMatch`, chat só com frases prontas e privacidade dos outros jogadores.

## Testes e limites

- `node --check` dos arquivos JS alterados; suíte de regressão selecionada com testes estáticos e unidades sem PostgreSQL; teste separado das lógicas reais (VM) para criação de peças/rotação/ajudas; verificação estática e visual do HTML/CSS em Chromium headless (larguras 320, 360, 375 e 412 px).
- **Não testados neste ambiente:** integração HTTP/Socket.IO real (dependências npm não instaladas), banco de dados PostgreSQL real, workflows do GitHub deste novo PR, Render, Android físico, desempenho FPS real no celular, fluxo competitivo completo em dois aparelhos. Os resultados locais não substituem validação do proprietário.
- **Aprovação:** nova branch da `main` atual, envio exato dos 16 arquivos, PR com ambos workflows (regressão PostgreSQL isolado e auditoria de dependências) verdes; Merge/deploy Render só pelo proprietário. Fechar e reabrir PWA sem desinstalar/limpar dados. Testar 6/12/20/30/48 Solo e Cooperativo: peças rot=0, toque repetido solta, encaixe e ambas dicas. Testar Sala Desafio Comum e Quebrando Cabeças: giros intactos, todos os demais eventos e conclusão sem desconectar contas. Informar aprovação antes da próxima rodada.

---

# CONTINUIDADE — ARRASTO MAIS LEVE E SEM ZOOM AUTOMÁTICO NAS 6 PEÇAS

**Data:** 31/10/2026 (America/Fortaleza). **`main` oficial confirmada antes da alteração:** `d9614ad5418ee6a99dfad68725d5eb78616ed430` (Merge PR #30 — correção de sessão cooperativa), árvore `3f62baeba31dd2ad1fcbdbb3d38ec9ca3ec037cb`. **Publicação:** somente o proprietário, por nova ramificação, PR, Merge, deploy Render e teste no Android. O assistente não realizou escrita ou deploy.

## Pedido aprovado

O proprietário confirmou a correção da desconexão ao fim de partidas cooperativas e autorizou melhorar a sensação de peça presa à bandeja e leves engasgos em **6 peças**. Esclarecimento indispensável: **não remover o zoom manual por pinça**, mesmo nas 6 peças. Retirar exclusivamente o **zoom automático ao selecionar, segurar e arrastar** nas partidas de 6 peças; nas outras 4 quantidades, preservar a ampliação atual. Manter o tamanho reduzido natural na bandeja e tamanho normal quando levado ao tabuleiro. Não alterar estética, sombras, sons, animações ou encaixe.

## Correções mínimas

- `public/game.js`: `baseScale()` retorna escala natural `TRAY/TILE` para peças de **6** na bandeja, inclusive selecionadas/arrastadas; ao chegar ao tabuleiro retorna `1` (tamanho normal), sem ampliação automática `HELD_SCALE` ou `small*1.12`. `targetScale()` e `setZoom()` permanecem iguais, portanto **zoom de pinça continua disponível**. A lógica de 12/20/30/48 não foi alterada.
- `public/game.js`: nas 6 peças, `onPointerDown()` guarda o deslocamento real entre dedo e centro da peça (`k=1`), sem correção de ampliação automática; `onPointerMove()` reconhece arrasto por toque após **5 px** em vez de 8 px. Nos outros modos, o cálculo e limiar antigo de 8 px continuam. O ajuste evita o salto/atraso inicial percebido ao puxar a peça da bandeja. Ao eliminar a ampliação desnecessária, também reduz o trabalho de reescalar as peças grandes por vários quadros quando apenas selecionadas/seguradas.
- `public/sw.js`: cache PWA `v18` → `v19` para entregar o novo `game.js` ao aplicativo instalado sem desinstalar ou limpar dados.
- Quatro testes de cache existentes atualizados para `v19`, sem mudar seus outros contratos, e novo `tests/arrasto-seis-pecas.test.js` para executar isoladamente trechos reais do cliente: sete casos de seleção, pinça, arrasto, comportamento das demais quantidades, prevenção de redesenho desnecessário e cache.

**Arquivos exatos do pacote (8):**

| Caminho no GitHub | Operação |
| --- | --- |
| `public/game.js` | substituir |
| `public/sw.js` | substituir |
| `tests/arrasto-seis-pecas.test.js` | adicionar |
| `tests/colecoes-galeria.test.js` | substituir (somente cache v19) |
| `tests/fluidez-animacoes.test.js` | substituir (somente cache v19) |
| `tests/library-visual.test.js` | substituir (somente cache v19) |
| `tests/sem-piscadas.test.js` | substituir (somente cache v19) |
| `CONTINUIDADE.md` | substituir (acrescentado este registro, todo histórico preservado) |

**Não alterar:** `server.js`, `challenge.js`, `accounts.js`, `resource-guard.js`, `security.js`, `xp.js`, `gems.js`, `library.js`, `phrases.js`, migrações, `public/style.css`, imagens, sons, HTML, manifest e restante do projeto. Servidor continua autoridade para encaixes e sincronização, dois `tryLock`/SNAP intocados, eventos Socket.IO preservados, XP só por `payMatch`, frases prontas e proteção de dados infantis sem alteração.

## Testes executados e limitações

- `node --check public/game.js`, `node --check public/sw.js` e novo teste: aprovados.
- `node --test tests/arrasto-seis-pecas.test.js`: **7 aprovados**, 0 falhas. Testes de lógica com funções reais via `vm` e ponteiros simulados (não em tela Android).
- Suíte de testes locais selecionados (contratos, segurança, XP, gemas, biblioteca, desempenho, animações, conta e gestos): **114 no total, 112 aprovados, 0 falhas, 2 ignorados** (PostgreSQL real indisponível). `socket.io-client` foi substituído por stub **somente para importar o módulo de helpers nos testes estáticos**, sem fingir integração. Testes de rede real e servidor/Socket.IO real não foram executados no ambiente porque dependências npm não estavam instaladas.
- **Não testados:** FPS e suavidade em Android físico, partida completa em aparelhos diferentes, servidor Render, Neon real, simulação de gestos em navegador real, teste de carga. O diagnóstico do engasgo visual é baseado no código e pode exigir ajuste fino após o teste real.

## Publicação, teste e aprovação

1. Conferir `main` novamente, criar nova branch, por exemplo `arrasto-6-pecas-sem-zoom-automatico`.
2. Enviar exatamente os 8 arquivos, nas pastas indicadas. Fazer PR para `main`; conferir 8 alterações e ambos os workflows de regressão e segurança verdes **antes do Merge**.
3. O proprietário faz Merge e deploy Render; fecha e reabre a PWA instalada pelo Chrome. Não desinstalar nem limpar os dados do aplicativo. Cache `v19` deve atualizar.
4. Android real: jogar 6 peças em Solo e Cooperativo; **tocar e segurar** não pode ampliar; **pinça de dois dedos** continua ampliando; puxar da bandeja precisa acompanhar dedo, girar, soltar, encaixar e concluir normalmente; voltar à tela inicial sem desconectar conta. Conferir também 12/20/30/48 para confirmar zoom anterior intacto. Reportar se ainda há engasgos para avaliar FPS/profiling de navegador, sem mudar outras mecânicas antes de aprovar esta rodada.

---

# CONTINUIDADE — CORREÇÃO DE SESSÃO AO FINAL DA PARTIDA COOPERATIVA

**Data:** 31/10/2026 (America/Fortaleza). **`main` de referência confirmada:** `47af66b1119878681b86ff5a68c93c5ad6009666` (PR #29 — auditoria de segurança). **Nova rodada:** correção de regressão de autenticação descoberta em teste Android pelo proprietário. **A alteração foi preparada localmente; não houve publicação nem deploy pelo assistente.**

## Sintoma e causa no código

Após concluir uma sala cooperativa e retornar à tela inicial, o cliente executa uma nova atualização de perfil (`loadMe`), que também reautentica o Socket.IO. Se outra autenticação do mesmo socket ainda estiver pendente, a versão do PR #29 retorna `error: 'auth'` para a resposta **obsoleta** (`sequence !== authGeneration`). O `public/conta.js` interpreta qualquer retorno `error: 'auth'` como token revogado e chama `logoutLocal()`, apagando o login. Um token de sessão **válido** pode, portanto, ser apagado em uma condição de corrida, sem logout real no banco. A reprodução controlada da sequência de autenticações confirma esse comportamento; ainda não foi reproduzido em Android físico por este ambiente.

## Correção mínima — 3 arquivos no ZIP

1. **`accounts.js` (raiz, substituir):** diferenciar respostas `superseded` (requisito de autenticação obsoleto ou socket desligado) das respostas `auth` (token verdadeiramente inválido/revogado). Manter a segunda consulta SQL de validade do token, para preservar o reforço de segurança anterior. Retornar sucesso sem desfazer/refazer o vínculo quando o token e o usuário já são os mesmos; impede oscilações de presença entre amigos.
2. **`tests/sessao-coop-race.test.js` (`tests/`, adicionar):** quatro testes com o `createAccounts` real e consultas SQL/Socket.IO simulados: autenticações concorrentes ao voltar da partida, reautenticação idempotente, rejeição de token revogado e logout durante autenticação pendente.
3. **`CONTINUIDADE.md` (raiz, substituir):** este registro, sem apagar o histórico.

**Nenhum `public/*`, `server.js`, `security.js`, `resource-guard.js`, `challenge.js`, `xp.js`, `gems.js`, banco, migração, imagem ou animação foi alterado.** Não muda cache, APK, sessão de banco nem XP. Eventos, encaixe duplicado, migrações imutáveis, pagamento de XP exclusivamente por `payMatch`, mensagens só por frases prontas e privacidade infantil continuam iguais.

## Evidência e limites dos testes

- Reproduzido sobre o **`accounts.js` original do PR #29**: 4 casos, **1 aprovado e 3 falharam** devido à diferenciação ausente de autenticação obsoleta e vínculo repetido.
- Com a correção: 4 testes, **4 aprovados**; em conjunto com testes selecionados de segurança, XP, gemas e biblioteca: **40 aprovados e 0 falhas**.
- `node --check accounts.js` e `node --check tests/sessao-coop-race.test.js`: aprovados.
- Dependências npm não estão instaladas neste ambiente: **não foi executada a integração real HTTP/Socket.IO/PostgreSQL**, nem a suíte completa `npm test`, nem testes Android. O GitHub Actions deverá executar `npm ci`, `npm audit`, `npm test` e o workflow de PostgreSQL isolado no Pull Request.
- Aprovação definitiva: o proprietário deve criar branch, enviar exatamente os 3 arquivos, conferir os dois workflows verdes, fazer Merge/deploy e testar **em dois aparelhos/contas** a conclusão cooperativa, retorno à tela inicial, permanência do login, amigos, histórico e XP/gemas. Não avançar rodada sem essa confirmação.

---

# CONTINUIDADE — AUDITORIA DEFENSIVA DE SEGURANÇA E RESILIÊNCIA

**Data:** 31/10/2026 (America/Fortaleza). **Base real `main` verificada no GitHub:** `8928aca2862ea0646bf111e4da964cd365abff63` (Merge PR #28 — Galeria B), árvore `97beca01896a6702e17844978a924fa5cf392647`. **Ponto de retorno:** mesmo commit, sem sobrescrever `main`; pacote para branch/PR do proprietário, sem escrita/deploy pelo assistente.

## Escopo

Rodada exclusiva de **segurança, proteção de contas, privacidade e estabilidade**; não foram alterados visuais, imagens, animações, mecânica de encaixe, níveis/XP/gemas, migrações SQL, sons ou arquivos `public/*`. Auditados Express e endpoints, Socket.IO dos dois modos, contas/sessões, código por e-mail, TLS PostgreSQL, relatórios CSP, limites de recursos, dependências declaradas e CI. **Relatório integral:** `AUDITORIA-SEGURANCA-2026-10-31.md`.

## Arquivos do pacote desta rodada

Arquivos alterados na raiz: `accounts.js`, `challenge.js`, `db.js`, `security.js`, `server.js`, `README.md`, `SEGURANCA.md`, `CONTINUIDADE.md`. Novos na raiz: `resource-guard.js`, `AUDITORIA-SEGURANCA-2026-10-31.md`. Novos em pastas: `.github/workflows/seguranca-dependencias.yml` e `tests/security-resilience.test.js`. **12 arquivos**.

## Correções

- Teto compartilhado de salas coop/duelo, limite por IP para criação; cotas de conexões e de eventos Socket.IO; controle de origem; limitação de uploads/HTTP/API/estáticos e operações pesadas; prazos de HTTP e banco. Proteções reagem com `busy`, `rate` ou `503` apenas ao excesso de requisições.
- Socket.IO de contas revalida sessões antes de convites e bloqueios; logout, logout-all, reset/troca de senha e exclusão invalidam identidades em tempo real; uma resposta atrasada não deve recriar autenticação revogada.
- Códigos de confirmação e recuperação consumidos atomicamente em SQL, sem nova migração; certificados remotos TLS sempre validados.
- Rota HTTP de caixa de e-mail de testes removida (nunca pública), CSP com dados/redação de URL e contadores limitados; workflow extra exige audit npm e testes em PR.
- Documentação atualizada, incluindo proibição da alternativa anterior `DB_SSL_VERIFY=0`.

## Limites da validação / NÃO APROVADO para distribuição pública ainda

**103 testes selecionados: 101 aprovados, 0 falhas, 2 ignorados**, incluindo 14 testes de `security-resilience` e simulação isolada de 20 mil tentativas sem rede externa. **Não executados:** banco PostgreSQL real, sessão de Socket.IO real, suíte npm completa com dependências instaladas, `npm audit` no registro, testes de carga em staging, Render/Neon, Android físico. Esses pontos exigem GitHub Actions + ambiente de teste autorizado, antes de liberar. **Persistem** risco elevado de DDoS distribuído sem WAF/proteção externa, necessidade de ativar CSP de bloqueio depois de testar, segredos/permissões/backup dos painéis a auditar. Não afirmar que o aplicativo é invulnerável ou está pronto até verificar isso.

## Invariantes

Preservar eventos Socket.IO, duas cópias de `tryLock`/SNAP, migrações imutáveis, XP unicamente em `payMatch`, gemas protegidas por PostgreSQL, 25 imagens/categorias e progresso, chat só frases prontas, privacidade de e-mail/XP bruto alheios, UI e animações. Os arquivos de imagem e `public/*` ficaram idênticos ao commit-base.

---

# HISTÓRICO ANTERIOR PRESERVADO

# CONTINUIDADE — REDESIGN DA BIBLIOTECA: GALERIA DE COLEÇÕES (OPÇÃO B)

**Data:** 31/10/2026 (America/Fortaleza)  
**Repositório:** `herbertttomes2028/QUEBRA-APK`  
**`main` confirmada antes de implementar e reconferida antes do pacote:** `c0ca24a2ad3668eca948eff33b35cafde9d74faa` (Merge PR #27, fluidez na abertura e resultados).  
**Tree da `main`:** `ec0c2a24242b173f58cb7e651f5b0710aad7b263`.

Esta é a seção atual do registro de continuidade; o histórico anterior segue abaixo sem supressões. Em nova rodada, ler este documento e confirmar novamente SHA e blobs da `main`. O assistente **não fez escrita no GitHub nem deploy**. A publicação, aprovação e teste Android ficam com o proprietário.

## 1. Pedido aprovado

Após aprovar o aumento de fluidez, o proprietário aprovou a **opção B de UI/UX para as categorias**: galeria vertical de coleções com capa principal grande, moldura discreta, títulos em maiúsculas e fonte Fredoka, poucas informações, cinco círculos indicando imagens concluídas, três estados visuais (disponível, bloqueada por progresso, especial por gemas), botões amarelos e tela interna de cinco imagens organizada em **duas colunas**. Preservar as fotos reais que o proprietário enviou, a categoria Espaço e ciência existente e as mecânicas/custos já implantados. Sem efeitos permanentes que afetem o Android.

## 2. Solução implementada

- **`public/game.js`**: `renderLibraryHome` mantém os mesmos cinco `CATEGORIES` vindos do servidor e cria cartões verticais com **uma imagem principal real** (o mesmo `imageItem(...).url` da montagem), pílula curta de estado, título centralizado, subtítulo, cinco pontos preenchidos de acordo com `libraryProgress.clears`, contagem `n de 5`, orientação de desbloqueio quando necessária e único botão de ação **ABRIR / BLOQUEADA / DESBLOQUEAR · N GEMAS**. Não duplica ou recalcula o direito de compra: continua usando `libraryAvailable`, `buyLibraryCategory` e a API existente. Sem inserção de HTML vindo de usuário, tudo criado por `textContent`. `aria-label` e estado `disabled` acessíveis.
- **`public/game.js`**: ao entrar em categoria, título centralizado em letras maiúsculas, instrução curta e progresso; cabeçalho genérico oculto para não repetir informações. `renderPickGrid` aplica `.library-gallery` apenas a categorias, mantém cinco imagens e marcador discreto de conclusão **★ Concluída**. A área **Imagens clássicas e Minha imagem** preserva a grade/seleção antiga, mostra seu próprio cabeçalho e continua acessível. Único **Voltar amarelo** retorna às categorias; após seleção, número de peças e botão JOGAR seguem sem alterações.
- **`public/index.html`**: adiciona somente `#library-detail` para a instrução/contagem abaixo do título da categoria. Nenhuma nova tela, script embutido ou modal.
- **`public/style.css`**: fundo creme **somente em `#screen-pick` (tema claro)**, cartões brancos com bordas leves, fotografia principal centralizada com `object-fit: contain` **sem recortar**, moldura dourada discreta, fonte Fredoka do próprio projeto, cinco círculos de progresso, botões amarelos acessíveis e grade de duas colunas com miniaturas grandes. Conserva a paleta escura ao usar `html[data-theme="dark"]`. Não introduz novas animações contínuas e respeita as preferências de movimento já existentes. Celebrar 5/5 continua com a animação dourada anterior.
- **`public/sw.js`**: revisão de cache v17 → **v18**; não altera endpoints, armazenamento, push nem estratégia de atualização.
- **`tests/library-visual.test.js`**, **`tests/sem-piscadas.test.js`**, **`tests/fluidez-animacoes.test.js`**: sincronizam testes existentes à versão v18 e ao título simplificado; mantêm as verificações das correções anteriores.
- **`tests/colecoes-galeria.test.js`**: novos testes de layout, títulos, progresso, estados de compra, imagens, navegação, Fredoka e proteção de contratos.
- **`CONTINUIDADE.md`**: este registro e todo o conteúdo anterior.

**Nenhum arquivo WebP foi enviado no ZIP**, porque as 25 imagens e suas miniaturas já estão na `main`, inclusive as 20 imagens pessoais incorporadas no PR #24. O WebP original que aparece na capa continua exatamente o arquivo usado no quebra-cabeça. O catálogo `library.js`, os IDs, preços e textos de imagem não foram modificados.

## 3. Arquivos exatos do pacote — 9

| Pasta no repositório | Arquivo | Operação |
| --- | --- | --- |
| `public/` | `game.js` | substituir |
| `public/` | `index.html` | substituir |
| `public/` | `style.css` | substituir |
| `public/` | `sw.js` | substituir |
| `tests/` | `library-visual.test.js` | substituir |
| `tests/` | `sem-piscadas.test.js` | substituir |
| `tests/` | `fluidez-animacoes.test.js` | substituir |
| `tests/` | `colecoes-galeria.test.js` | adicionar |
| raiz | `CONTINUIDADE.md` | substituir |

**Não substituir:** fotos, miniaturas, `library.js`, `server.js`, `accounts.js`, `challenge.js`, `conta.js`, migrations, SQL, `gems.js`, `xp.js`, config Render, `package.json`, outro CSS/JS.

## 4. Contratos preservados

Sem modificação de regra de encaixe/`SNAP` duplicados, rotação, magnetismo, sons, XP exclusivo via `payMatch`, compras/gemas no servidor, migrações, eventos Socket.IO de ambos os modos, contas, amizades, chat de frases prontas, e-mails/XP alheios, guarda do progresso, IDs das imagens, acessibilidade de botão, resultados, animação 360° e animação dourada de 5/5. Categorias 1 gratuita; 2 ao concluir as cinco da 1; 3 ao concluir as cinco da 2; 4 por 25 gemas; 5 por 40 gemas de forma independente. As regras continuam no código existente do servidor; mudanças são de apresentação.

## 5. Base e comparação com a main

Antes de alterar, foram comparados por `git hash-object` os originais de `public/game.js`, `public/style.css`, `public/sw.js`, `public/index.html` e `CONTINUIDADE.md` com os blobs oficiais da `main` c0ca24a: todos idênticos. Os três testes antigos têm originais preservados na última rodada e hashes conferidos com a árvore oficial. `tests/colecoes-galeria.test.js` não existia na `main`. Antes de gerar o ZIP, a `main` continuava em c0ca24a (tree ec0c2a2). Não foram sobrescritos avanços posteriores.

## 6. Testes executados e limitações

- `node --check` em scripts alterados: aprovado.
- Suíte **selecionada** dos testes de contratos, desempenho, XP, gemas, histórico, animações, biblioteca e UI: **89 testes, 87 aprovados, 0 falhas, 2 ignorados** (PostgreSQL real). Para carregar testes estáticos neste ambiente sem dependências instaladas, foi usado stub de `socket.io-client` somente para carregamento; **não corresponde a teste de integração com Socket.IO real**. A suíte npm completa de coop/desafio com Socket.IO real não foi executada.
- Chromium, com o HTML/CSS/JS da interface e os 25 WebPs reais carregados via dados locais, APIs e Socket.IO **simulados**: telas 320×650, 360×740, 412×915. Em cada largura: cinco cartões verticais, 25 pontos totais, 5 capas, botões e estados, galerias com duas colunas, título centralizado, sem rolagem horizontal, retorno com Voltar, escolha de uma imagem e JOGAR centrado (desvio 0 px). Conclusão local 5/5 libera categoria 2; compra simulada da 5 por 40 gemas não libera a 4; 25 imagens selecionadas e carregadas; celebração dourada somente após 5/5 e, para conta, somente após API confirmar; 0 erros de JavaScript observados.
- **Não testados:** Android físico, fluidez/FPS real no celular, partida completa com Socket.IO real, Render, Neon/PostgreSQL real, compras reais, progresso em produção ou atualização do cache de APK já instalado. O proprietário deve validar.

## 7. Publicação e aprovação

1. Criar branch a partir da `main`, por exemplo `design-galeria-colecoes-opcao-b`.
2. Extrair o ZIP; enviar os **9 arquivos exatos** nas pastas indicadas, sem enviar o ZIP fechado para o repositório; commits apenas na branch.
3. Criar Pull Request com base `main`. Conferir **9 arquivos** em `Files changed`. Aguardar GitHub Actions (não fazer Merge se algum teste falhar).
4. Com testes verdes, o proprietário faz o Merge, realiza deploy manual no Render e fecha/reabre o APK para atualizar o cache v18. **Não limpar dados do aplicativo**, especialmente de visitantes.
5. No Android real: comparar capas com imagens do jogo, tocar em todas as cinco categorias, verificar progresso, bloqueios e preços, comprar somente com consentimento/conta suficiente, ver “Minha imagem”, tocar Voltar, selecionar 6/12/20/48 peças, verificar JOGAR, giro de 360°, encaixes, sons, vitória e animação dourada sem travamentos. Informar aprovação antes da próxima rodada.

---

# HISTÓRICO ANTERIOR PRESERVADO

# CONTINUIDADE — FLUIDEZ NA ABERTURA E NA EXIBIÇÃO DE RESULTADOS

**Data:** 31/10/2026 (Fortaleza)  
**Repositório:** `herbertttomes2028/QUEBRA-APK`  
**Base `main` confirmada em GitHub:** `f4c8a3e92fa1f3adf3f01bbe3b90421da6bbd70d` (Merge do PR #26, correção de piscadas em amigos e perfil)  
**Tree GitHub:** `9b6c17bbf4e49bcb26499266080ca4f542921422`.

> Esta seção descreve a rodada mais recente. Todo o histórico anterior segue abaixo, intacto. Para nova rodada, ler este documento e conferir a `main` novamente. Nenhuma escrita/deploy feita pelo assistente; só o proprietário faz Merge, deploy e validação Android.

## 1. Pedido do proprietário

Após aprovar a rodada das piscadas, o proprietário relatou **engasgo ao aparecer o resultado de imagem concluída** e **pequenos travamentos no giro vertical da carta da abertura**. Pedido: aliviar ambos mantendo movimentos e funções que já foram aprovados.

## 2. Diagnóstico de código e mudanças pontuais

A implementação atual utilizava, na abertura de imagens da biblioteca, **o arquivo principal 768×1024** como textura de uma carta de no máximo 250 px. Na preparação do giro, forçava `void el.offsetWidth`, uma leitura de layout síncrona depois de mostrar a camada, justamente enquanto a grade de seleção ainda estava montada. O CSS aplicava sombra de 40 px à carta em rotação 3D.

Na conclusão Solo/Cooperativo, `showWin` aplicava `#field.won` antes de `showVictoryResult`, fazendo o navegador alterar estilos das peças e ocultar seus contornos **antes** de `board.getBoundingClientRect()`; a medição podia exigir atualização sincronizada do layout no começo da animação. Não há evidência de que este seja o único fator de engasgo no Android; é um ponto de custo identificado no código.

**Alterações:**

- **`public/game.js` — abertura:** somente a **carta giratória** passa a usar a miniatura WebP correspondente (`item.thumb`, com a revisão de cache já adotada na biblioteca). A imagem do quebra-cabeça e as capas/galerias **continuam sendo as imagens principais**, exatamente como na rodada anterior. Durante a escolha na biblioteca, a miniatura da abertura é pré-carregada e solicitada para decodificação assíncrona, sem atrasar o botão JOGAR por causa dela. Se não existe miniatura, há fallback para o arquivo principal. Removida a leitura `void el.offsetWidth`; a classe de animação é aplicada no próximo `requestAnimationFrame`. Um quadro agendado é cancelado se a abertura for fechada, para evitar animação atrasada.
- **`public/game.js` — conclusão:** a classe visual `#field.won`, que remove contornos dos SVGs, é aplicada apenas quando a janela de resultados é revelada, e não antes da medida inicial do tabuleiro. Preservados o pulinho de 6%, flutuação de **2,3 s**, sobreposição dourada, toque para pular, cancelamento, acessibilidade, som e o momento de mostrar XP/gemas. O resultado do Desafio continua seguindo seu fluxo original.
- **`public/style.css`:** reduz a sombra da carta que está girando (de 40 px para 18 px) mantendo moldura amarela e **giro em pé `rotateY(-360deg)` até zero**. Em `.victory-flight-photo`, adiciona `contain: layout` para isolar layout sem cortar o contorno dourado exterior. Nenhuma animação aprovada removida.
- **`public/sw.js`:** revisão de shell `v16` → **`v17`** para o Android receber a nova interface. Sem alteração nas rotas de rede nem no armazenamento de dados.
- **`tests/desempenho.test.js`**, **`tests/vitoria-animacao.test.js`**: preservam/regredem geometria, giro, duração, miniatura, não forçar layout síncrono, e a ordem de `won` em relação à janela de resultado.
- **`tests/library-visual.test.js`**, **`tests/sem-piscadas.test.js`**: atualizam apenas a expectativa da versão de cache de v16 para v17.
- **`tests/fluidez-animacoes.test.js`** (novo): três testes para abertura (com VM sem leitura de offsetWidth, agendamento/cancelamento da animação e miniatura), conclusão e estilos.
- **`CONTINUIDADE.md`**: documentação desta rodada.

**Contratos intocados:** regras de encaixe `tryLock`/`SNAP` em `server.js` e `challenge.js`, eventos Socket.IO, migrações, XP apenas via `payMatch`, gemas só no servidor, sala Solo/Cooperativa/Desafio, biblioteca com 25 imagens, contas, amigos, privacidade infantil, sons e animações originais de sucesso.

## 3. Arquivos do pacote — 9 no total

| Pasta | Arquivo | Ação |
| --- | --- | --- |
| `public/` | `game.js` | substituir |
| `public/` | `style.css` | substituir |
| `public/` | `sw.js` | substituir |
| `tests/` | `desempenho.test.js` | substituir |
| `tests/` | `vitoria-animacao.test.js` | substituir |
| `tests/` | `library-visual.test.js` | substituir |
| `tests/` | `sem-piscadas.test.js` | substituir |
| `tests/` | `fluidez-animacoes.test.js` | adicionar |
| raiz | `CONTINUIDADE.md` | substituir |

**Não enviar nem substituir:** fotos, miniaturas, `server.js`, `challenge.js`, `accounts.js`, `conta.js`, arquivos de configuração do Render, SQL ou migrações. O APK não precisa ser recompilado para esta alteração do PWA; somente o proprietário confere o resultado instalado.

## 4. Comparação com a `main`

Imediatamente antes de preparar a entrega, a `main` ainda estava no commit `f4c8a3e`, tree `9b6c17b`. Os blobs originais dos oito arquivos preexistentes acima foram conferidos localmente com os hashes retornados pela árvore oficial do GitHub, sem divergência. `tests/fluidez-animacoes.test.js` é arquivo novo (ausente na `main`). Assim, o ZIP não foi baseado em uma versão antiga do jogo.

## 5. Testes e limites

- `node --check public/game.js`, `node --check public/sw.js`, `node --check public/conta.js`: aprovados.
- Suíte **selecionada** em Node (contratos, desempenho, vitória, biblioteca, contas visuais, XP, gemas e histórico): **84 testes**, **82 aprovados**, **0 falhas**, **2 ignorados**, os dois de PostgreSQL. Para permitir carregar a infraestrutura de testes estáticos sem dependências `npm` instaladas no ambiente, `socket.io-client` usou um stub *somente para carregamento*; isso **não é teste de integração Socket.IO**.
- Chromium real com HTML/CSS reais, trecho real do controlador de abertura/vitória e funções servidor/cliente simuladas: **320×650, 360×740 e 412×915 px**. Em todos: classe `go-spin` entrou normalmente; imagem referenciada na abertura usou a pasta de miniaturas; resultado apareceu após animação, `#field.won` não foi ativado antes e ficou ativo ao final; **0 exceções JS observadas**. O ambiente isolado não permitiu carregar as imagens via HTTP/`file://`; esse ensaio cobre o comportamento e a pintura do CSS/DOM, não comprova decodificação nem taxa de FPS no Android.
- **Não testados:** Android físico, FPS/taxa de quadros no aparelho do proprietário, Socket.IO real/cooperativo/desafio ponta a ponta, Neon/PostgreSQL real, Render e comportamento do cache num APK já instalado. Não se afirma que qualquer engasgo Android esteja 100% eliminado sem validação do proprietário.

## 6. Publicação e validação

1. Criar nova branch a partir da `main`, sugestão `fluidez-abertura-resultado`.
2. Extrair ZIP e enviar somente os nove arquivos exatamente nas pastas da tabela. Conferir **9 arquivos** no Pull Request, base `main`.
3. Aguardar GitHub Actions. **Não fazer Merge se o workflow falhar.**
4. Com Actions verdes, o proprietário faz Merge e deploy manual no Render; abrir o APK para atualização do service worker v17 e, se necessário, fechar/abrir novamente. **Não limpar armazenamento ou dados do app**.
5. Testar no Android girando imagens clássicas e novas, Solo, Cooperativo e Desafio; concluir imagens de 6, 12, 20, 30 e 48 peças, observar resultados, toque para continuar, som, XP e gemas. Se o engasgo persistir, trazer vídeo do aparelho e informar modelo, modo e número de peças para novo diagnóstico após a validação desta rodada.

---

# HISTÓRICO ANTERIOR PRESERVADO

# CONTINUIDADE — REMOÇÃO DAS PISCADAS EM AMIGOS E ESTATÍSTICAS

**Data:** 31/10/2026 (Fortaleza)  
**Repositório:** `herbertttomes2028/QUEBRA-APK`  
**Base `main`:** `5113728fe2567e8e2ef6c749c59acf6b276017f5` — Merge PR #25 (`corrigir-capas-fonte-voltar-biblioteca-4`)  
**Árvore-base:** `efb62603770377afce37fb590a9840d780c6bd5b`.

## 1. Solicitação e diagnóstico

O proprietário aprovou a correção anterior e identificou que, ao abrir **Amigos**, nomes e linhas pareciam piscar três vezes; o mesmo ocorria nos quadros das estatísticas de partidas no **Perfil**, inclusive perfil de amigo. O problema foi encontrado na UI: `.fr-row` e `.me-stat` tinham animação `me-row` com opacidade inicial zero aplicada a cada novo nó, enquanto `openMe` chamava `renderFriends` e múltiplas buscas/redesenhos, e `renderProfile` zerava e recriava os quatro cartões a cada atualização.

Esta rodada **não altera** o servidor, Socket.IO, PostgreSQL, o cálculo ou a gravação de XP/gemas, o histórico das partidas, o sistema de amigos, as imagens ou as regras de encaixe do quebra-cabeça.

## 2. Correção implementada

- **`public/style.css`:** remove apenas `animation: me-row...` das regras `.fr-row` e `.me-stat`. As linhas, cores, bordas, molduras, tamanhos e os outros efeitos do jogo ficam inalterados. Isso também evita a piscada dos registros visuais na aba Partidas, que usam `.fr-row`.
- **`public/conta.js`:** implementa `paintStats` para atualizar os valores nos mesmos quatro cartões DOM de **Meu perfil** e **Perfil do amigo**, sem apagar a grade nem reiniciar transições; remove os `animationDelay` desses cartões. Nas listas de amigos, respostas `/friends` idênticas não recriam os nós; respostas com presença ou convites alterados continuam atualizando normalmente. Remove uma chamada duplicada a `loadFriends` em `setTab('friends')`, pois `openMe` e `afterAuth` já a fazem. Evita redesenhar estatísticas ocultas ao abrir Amigos em resposta a `/me`.
- **`public/sw.js`:** cache da interface `quebra-cabeca-v15` → `quebra-cabeca-v16` para o APK carregar os novos `conta.js` e `style.css`. Preserva estratégia offline e endpoints não cacheados.
- **`tests/library-visual.test.js`:** expectativa da versão do cache atualizada de v15 para v16.
- **`tests/sem-piscadas.test.js`:** quatro testes novos: CSS sem animações, cartões reaproveitados, amigos não recriados em dados idênticos e cache atualizado.
- **`CONTINUIDADE.md`:** registra esta rodada, preservando integralmente o histórico anterior abaixo.

## 3. Arquivos ZIP para a nova ramificação — 6 arquivos

| Pasta | Arquivo | Operação |
| --- | --- | --- |
| `public/` | `conta.js` | substituir |
| `public/` | `style.css` | substituir |
| `public/` | `sw.js` | substituir |
| `tests/` | `library-visual.test.js` | substituir |
| `tests/` | `sem-piscadas.test.js` | adicionar |
| raiz | `CONTINUIDADE.md` | substituir |

Não enviar `game.js`, `index.html`, imagens, `library.js` nem arquivos SQL. Antes de montar o ZIP, os arquivos de base foram comparados pelo SHA de blob Git com a `main` atual. Não enviar diretamente à `main`.

## 4. Testes realizados e limites

- `node --check public/conta.js` e `node --check public/sw.js`: **passaram**.
- Suite Node selecionada, com **stub de `socket.io-client` apenas para permitir carregamento de arquivos estáticos de contratos**, sem simular uma integração real: **81 testes, 79 aprovados, 0 falhas, 2 ignorados (PostgreSQL)**. Inclui os quatro testes novos.
- Chromium real com interface HTML/CSS/JS atual, mas API e Socket.IO **simulados**: larguras 320, 360 e 412 px, sem exceções de JS; verificou quadros sem animação, estatística mudando de 12 para 13 sem substituir o mesmo nó, repetição de evento de presença sem recriar a linha, mudança real online/offline preservada e perfil do amigo sem animação.
- O primeiro comando `node tests/run.js` no ambiente isolado falhou por **falta da dependência `socket.io-client`**, que não está instalada neste ambiente, e pela antiga expectativa `v15` em teste (corrigida nesta rodada). O resultado de 79 aprovados é de uma **seleção de testes**, não de `npm test` completo com dependências reais.
- **Não testados:** Android físico (somente o proprietário testa), banco Neon/PostgreSQL, deploy Render, multiplayer real e ciclo completo de login usando serviços reais, efeito do service worker instalado no APK. **Nenhuma publicação ou deploy foi feita pelo assistente.**

## 5. Procedimento de publicação

1. Criar uma nova ramificação baseada na `main` no GitHub, por exemplo `corrigir-piscadas-amigos-perfil`.
2. Extrair ZIP e enviar os três arquivos `conta.js`, `style.css`, `sw.js` para `public/`; os dois testes para `tests/`; `CONTINUIDADE.md` para a raiz. Conferir **6 arquivos** em `Files changed`.
3. Abrir Pull Request com base `main`, conferir Actions; **não fazer Merge se os testes estiverem vermelhos**.
4. Com Actions verdes, proprietário faz Merge e deploy no Render, fecha e abre o Android para atualização do cache, sem limpar os dados do aplicativo.
5. No Android: abrir Amigos (nomes sem piscar), acompanhar entrada/saída online, abrir Meu Perfil (estatísticas estáveis), abrir Perfil de amigo (estatísticas estáveis), conferir Partidas e resultados, e testar jogo rápido para verificar regressões. Só após aprovação iniciar nova rodada.

## 6. Contratos preservados

Sockets e salas inalterados; regra SNAP/encaixe duplicada inalterada; XP somente via `payMatch`; gemas e compra no servidor; migrações imutáveis; bate-papo infantil somente frases prontas, sem exibir e-mail nem XP bruto de outros jogadores.

---

# HISTÓRICO ANTERIOR PRESERVADO

# CONTINUIDADE — CORREÇÃO DE CAPAS, FONTE E NAVEGAÇÃO DAS CATEGORIAS

**Data:** 31/10/2026 (Fortaleza)  
**Repositório:** `herbertttomes2028/QUEBRA-APK`  
**`main` consultada antes da rodada:** `5f55121ab359c9de70b9fc5e30dd08d25a316147` — Merge PR #24, imagens próprias e design  
**Tree da `main`:** `58ef82429517b657e47d9d19ddc27ed32c50bfce`.

> **ESTA É A SEÇÃO ATUAL.** Antes de qualquer rodada, ler `CONTINUIDADE.md`, confirmar o SHA atual da `main` e comparar os arquivos para não sobrescrever alterações novas. Não publicar diretamente na `main`. O proprietário publica o ZIP em uma nova branch, confere os Actions, faz Merge, testa no Android e aprova. Sem aprovação no Android, não iniciar nova alteração.

## 1. Pedido e diagnóstico

Após publicar PR #24, o proprietário relatou que algumas **capas de categorias e miniaturas de seleção continuavam exibindo figuras antigas**, apesar das imagens principais já terem sido trocadas; relatou também **fonte diferente** nas novas categorias, **cabeçalho da categoria não centralizado**, botão duplicado **“Categorias”** desnecessário e botão único **“Voltar”** que deveria ser **amarelo**. Ajustar igualmente para as cinco categorias, sem mexer em animações, encaixes, Socket.IO, XP, compras ou banco.

**Causa técnica provável das capas antigas:** `libraryImage` e `prepareThumb` exibiam caminhos `biblioteca/mini/...`, enquanto a montagem utilizava `biblioteca/...`. Os dois arquivos têm caches independentes, e o service worker atende imagens primeiro da cópia local. Assim, a capa antiga podia persistir mesmo quando o arquivo principal estava novo. Não foi comprovado em Android real; solução evita essa divergência por construção.

## 2. Solução implementada

- **`public/game.js`:** todas as capas de categoria e imagens da galeria **usam `imageItem(file).url`, exatamente o original que gera as peças do quebra-cabeça**; a prévia após escolher e a abertura também usam o original quando é uma imagem da biblioteca. Os `25` originais ganham a mesma revisão de URL `?v=capas-20261031` apenas no **cliente**, sem alterar `file`/IDs de jogo, nomes ou imagens enviadas pelo socket. Assim, não reutilizam chaves de cache antigo de miniaturas e imagens, inclusive quando já existem WebP antigos no aparelho. **Nenhuma imagem foi regravada ou adicionada.** As miniaturas antigas permanecem no repositório; não são usadas por esta tela.
- **`public/index.html`:** remove o botão redundante `#library-back` do cabeçalho das categorias; deixa `#library-heading` sozinho para centralização. O botão existente `#btn-pick-back` usa `btn-primary` (amarelo). Ele já tinha a lógica correta: dentro de uma categoria retorna à lista de categorias; na lista volta ao menu anterior. Não foi alterado o controlador da navegação.
- **`public/style.css`:** aplica a fonte **Fredoka local já usada no restante do jogo** aos cartões de categorias, ações e cabeçalho, sem introduzir fonte nova. Centraliza `library-heading` horizontalmente e estiliza `#btn-pick-back` amarelo de acordo com `--sun`/`--on-sun`/`--sun-deep` do projeto; deixa no topo à esquerda para fácil acesso. Mantém amarelos os botões Abrir, molduras douradas, celebração dourada, posicionamento do JOGAR e todos os demais estilos.
- **`public/sw.js`:** cache `quebra-cabeca-v14` → `quebra-cabeca-v15`; preserva a estratégia atual de funcionamento offline/atualização.
- **`tests/library-visual.test.js`:** adapta a versão do cache para v15 e adiciona regressões de URLs iguais entre capas/galeria/partida, fonte, cabeçalho centralizado, botão amarelo único e navegação.
- **`CONTINUIDADE.md`:** esta documentação e histórico anterior integral.

## 3. ZIP — somente 6 arquivos

| Caminho | Operação |
| --- | --- |
| `public/game.js` | substituir |
| `public/index.html` | substituir |
| `public/style.css` | substituir |
| `public/sw.js` | substituir |
| `tests/library-visual.test.js` | substituir |
| `CONTINUIDADE.md` | substituir na raiz |

**Não enviar imagens nesta rodada:** as 20 imagens próprias (Fauna, Biomas, Cultura, Fantasia) já foram publicadas no PR #24 e estão em `public/biblioteca/`. Espaço e Ciência continua com as imagens anteriores. Não alterar arquivos do banco (`migrations/`), `library.js`, `server.js`, `accounts.js`, `challenge.js`, `xp.js` ou demais telas.

## 4. Testes realmente executados

- `node --check public/game.js` e `node --check public/sw.js`: **passaram**.
- Testes Node estáticos/unidade selecionados (incluindo as regressões visuais desta rodada), com `socket.io-client` **stub apenas de carregamento**: **77 no total, 75 aprovados, 0 reprovados e 2 ignorados** (PostgreSQL real). Não equivale a teste de Socket.IO real nem a `npm test` com todas dependências.
- Navegador Chromium real, usando HTML/CSS/JS e arquivos WebP reais embutidos em `data:` por restrição de acesso HTTP local do ambiente, API/Sockets simulados: três viewports **320×650**, **360×740**, **412×915**. Confirmado: capa categoria usa o mesmo arquivo de imagem completo que a galeria e a prévia/JOGAR; cinco galerias cobrem **25/25** imagens principais (768×1024), fonte Fredoka carregada, título de categoria centrado no contêiner, apenas um Voltar amarelo funcionando, botão JOGAR centrado; zero erros JavaScript observados. Este teste **não validou o comportamento do cache HTTP/Service Worker real**, apenas a lógica de URLs e versão no código.
- **Não testados:** Android físico, deploy Render, banco Neon/PostgreSQL, compras reais, multiplayer Socket.IO, testes completos de partida, cache real do APK em produção. Somente o proprietário pode confirmar no Android.

## 5. Publicação pelo proprietário

1. Criar nova ramificação a partir da `main` (sugestão: `corrigir-capas-fonte-voltar-biblioteca`).
2. Extrair o ZIP; **não enviar ZIP fechado**. Enviar `game.js`, `index.html`, `style.css`, `sw.js` para **`public/`**, substituir `library-visual.test.js` em **`tests/`**, e substituir `CONTINUIDADE.md` na **raiz**. **Exatamente seis arquivos.**
3. Abrir PR com base `main`. Verificar `Files changed` (seis substituições), resultados de Actions e eventuais conflitos. Se falhar, não fazer Merge.
4. Depois do verde, proprietário faz Merge e deploy no Render, fecha e reabre o APK para atualizar shell e cache do service worker. Pode ser necessário abrir novamente depois da atualização do aplicativo; evitar limpar dados locais, porque visitante guarda progresso local.
5. Verificar no Android todas as cinco categorias, capas iguais às fotografias que aparecem no quebra-cabeça, botão Voltar amarelo sem botão Categorias, fonte Fredoka, título centralizado, JOGAR centrado, progresso 5/5, compras de gemas, animação de abertura/encaixe/vitória/celebração. **Aprovação do proprietário somente após esse teste.**

## 6. Contratos que não foram tocados

Regra SNAP/encaixe duplicada, eventos Socket.IO, salas, regra XP apenas via `payMatch`, gemas e compras validadas no servidor, migrações SQL imutáveis e privacidade infantil (frases prontas, sem exibir e-mail ou XP bruto). Imagens e identificadores 25/25 inalterados.

---

# HISTÓRICO INTEGRAL PRESERVADO — SEÇÕES ANTERIORES

# CONTINUIDADE — RODADA DE IMAGENS PRÓPRIAS E POLIMENTO DA BIBLIOTECA

**Atualizado:** 30/10/2026 (horário de Fortaleza)  
**Repositório:** `herbertttomes2028/QUEBRA-APK`  
**Commit atual da `main` consultado antes da implementação:** `377d64ecfeb88ac27512391a6b047b070646d029` (Merge PR #23, Biblioteca categorias progressao)  
**Árvore-base da `main`:** `bd3ff70c66f13c42acaf9790bd8e2611be09e29b`.

> **ESTA É A SEÇÃO MAIS RECENTE.** O `CONTINUIDADE.md` da `main` de referência está preservado integralmente depois de "HISTÓRICO PRESERVADO". Próxima rodada: reler a seção atual e confirmar o novo SHA da `main`. Não atualizar `main` diretamente; preparar ZIP, enviar a uma nova branch, verificar Actions, fazer Merge e deploy pelo proprietário, testar no Android e aprovar. O assistente não tem acesso de escrita ao GitHub, ao Render nem ao Neon.

## 1. Pedido e conteúdo entregue

O proprietário enviou **quatro arquivos ZIP com 20 imagens próprias** para substituir as quatro categorias correspondentes da biblioteca que já está publicada no GitHub. Pediu manter **Espaço e ciência** como estava, títulos das categorias **sem números e em maiúsculas**, botões **Abrir amarelos**, imagens de capa **dentro de molduras**, uma **animação dourada ao concluir uma categoria (5/5)** e o botão **JOGAR centralizado** abaixo das quantidades de peças.

- **20 imagens principais** da fonte do proprietário, convertidas de JPG/PNG para WebP 768×1024, e **20 miniaturas** WebP 240×320. As versões fornecidas já tinham a proporção 3:4 (exceto uma diferença menor que 1% na capivara, recortada ao centro). Os arquivos originais foram tratados com redução LANCZOS e compressão WebP, sem criação ou troca dos objetos das fotografias.
- Os **cinco arquivos de `lib-espaco-01.webp` a `lib-espaco-05.webp` e suas cinco miniaturas foram mantidos byte a byte**, iguais à base da `main`; todos os outros arquivos da biblioteca não incluídos na lista de entrega foram preservados.
- Categoria **FAUNA BRASILEIRA**: `lib-fauna-01.webp` onça-pintada ("Onça-pintada avançando na selva.png"); `-02` arara-azul; `-03` tucano; `-04` **capivara** (arquivo de origem com nome genérico "Gemini_Generated_Image_om16w0om16w0om16.jpg"); `-05` boto-cor-de-rosa.
- Categoria **NATUREZA E BIOMAS**: `lib-biomas-01` cachoeira amazônica; `-02` dunas; `-03` cerrado; `-04` Pantanal; `-05` araucárias.
- Categoria **CULTURA BRASILEIRA**: `lib-cultura-01` frevo; `-02` festa junina; `-03` capoeira; `-04` maracatu; `-05` renda.
- Categoria **MUNDOS FANTÁSTICOS**: `lib-fantasia-01` dragão; `-02` castelo; `-03` ilhas flutuantes; `-04` bosque; `-05` baleia das estrelas.
- **IDs e rótulos do catálogo `library.js` não mudaram.** Isso preserva compras, desbloqueios, progressão e compatibilidade com partidas. Atenção: conquistas já registradas sob o mesmo ID permanecem concluídas mesmo após a fotografia ser substituída (solicitação de substituição, não de criação de uma imagem nova).

## 2. Alterações de código estritamente visuais

- **`public/game.js`:** o cartão de categoria exibe o nome com `toLocaleUpperCase('pt-BR')`, **sem prefixar número**; o cabeçalho da categoria também usa maiúsculas. Ao receber um evento de conclusão de jogo que fecha 5/5, marca uma possível celebração; só a mostra na tela de categorias quando o progresso é validado: armazenamento local no caso de visitante, API do servidor no caso de conta. Uma faixa "CATEGORIA CONCLUÍDA!" e o cartão recém-concluído recebem o efeito, **uma vez por nova conclusão**. Não modifica `won`, pagamentos nem eventos de socket; apenas usa a chamada existente `localLibraryComplete`.
- **`public/style.css`:** moldura dourada discreta na capa 3:4 de cada categoria (inclusive bloqueada), botão **Abrir** amarelo com texto escuro, animações CSS douradas na faixa/cartão ao concluir, e o botão `#btn-pick-go` centralizado no `.pick-sheet` com `margin: 0 auto; align-self: center; max-width: 330px`. Animação respeita tanto `prefers-reduced-motion: reduce` quanto o ajuste do próprio aplicativo `data-motion="reduce"`. Não muda a animação de vitória, abertura, peças, magnetismo, som ou telas antigas.
- **`public/sw.js`:** cache do aplicativo de `quebra-cabeca-v13` para **`v14`**, garantindo que, na atualização do APK/PWA, os WebP alterados não continuem na cache da versão anterior. A estratégia de cache do projeto não foi alterada.
- **`tests/library-visual.test.js`:** teste novo de regressão para títulos, botão amarelo, moldura, botão JOGAR centralizado, celebração 5/5 e cache v14.
- **`CONTINUIDADE.md`:** este registro atualizado e histórico anterior integral.

**Não foram modificados:** `library.js`, `server.js`, `accounts.js`, `challenge.js`, `xp.js`, migrações SQL, economia de gemas, outros testes nem telas de contas. **Nenhuma migração nova é necessária.**

## 3. Lista exata dos arquivos do ZIP

**45 arquivos:**

| Tipo | Caminho | Quantidade |
| --- | --- | ---: |
| Interface | `public/game.js`, `public/style.css`, `public/sw.js` | 3 |
| Imagens principais da biblioteca | `public/biblioteca/lib-{fauna,biomas,cultura,fantasia}-{01..05}.webp` | 20 |
| Miniaturas | `public/biblioteca/mini/lib-{fauna,biomas,cultura,fantasia}-{01..05}.webp` | 20 |
| Teste novo | `tests/library-visual.test.js` | 1 |
| Continuidade | `CONTINUIDADE.md` | 1 |
| **Total** | | **45** |

As cinco imagens e cinco miniaturas `espaco` não são incluídas no ZIP **porque não precisam ser substituídas**; já estão na `main`.

## 4. Testes executados e limitações

- **Verificação de sintaxe:** `node --check public/game.js` e `node --check public/sw.js`: passaram.
- **Suíte de testes da rodada (com stub *apenas* para carregar os testes estáticos dependentes de `socket.io-client`):** 75 testes no total, **73 aprovados, 0 falhas e 2 ignorados** (PostgreSQL real). A suíte completa `npm test` com dependências reais, Socket.IO e PostgreSQL **não foi executada** neste ambiente. Stub não equivale a uma conexão real.
- **Chromium real, com HTML/CSS/JS do projeto em ambiente controlado, sem servidor Socket.IO:** larguras **320×650, 360×740 e 412×915**, cinco cartões de categoria, títulos em caixa-alta sem números, capa com borda de 3px, botão "Abrir" com `rgb(255, 207, 51)`, botão "JOGAR" com desvio horizontal **0,00 px** em cada largura; navegação, seleção e carregamento das 25 imagens, compra de categoria 5 com API *simulada* independente da 4, progresso local liberando a 2; comemoração após 5/5, sem repetição e confirmação de progresso da conta com API *simulada*. Zero erros de JavaScript observados.
- **Arquivos:** os 25 originais (20 substituídos + 5 preservados) foram verificados como WebP 768×1024; as 25 miniaturas como WebP 240×320, abaixo dos limites de tamanho. A capivara foi identificada por inspeção visual na prancha de imagens do usuário.
- **Não testados:** Android físico, Render, Neon, compras reais, conexão Socket.IO real, partidas Solo/Coop/Desafio de ponta a ponta e desempenho de FPS do aparelho. Validar no Pull Request com GitHub Actions e depois pelo proprietário no Android.

## 5. Como publicar e validar

1. Confirmar antes do envio que a `main` não mudou em relação ao commit `377d64e`. Se mudou, comparar os arquivos de novo. Criar branch nova, sugerida `biblioteca-imagens-proprias-design` (nunca editar `main` diretamente).
2. Extrair ZIP e enviar **somente seus 45 arquivos** respeitando a hierarquia; substituir `game.js`, `style.css`, `sw.js`, `CONTINUIDADE.md`, vinte fotos principais e vinte miniaturas; adicionar teste `tests/library-visual.test.js`. Manter `library.js`, todos os arquivos da categoria Espaço, outras imagens clássicas e todos os demais arquivos sem alteração.
3. Abrir Pull Request para `main`. Conferir aba `Files changed`: exatamente **45 arquivos**, sendo 44 substituídos e **um teste adicionado**. Aguardar o workflow de regressão ficar verde; em caso de erro, corrigir a branch antes de fazer Merge.
4. O proprietário faz Merge, deploy manual no Render e abre/reabre o APK para o service worker atualizar para cache v14. Nenhuma SQL nova é necessária.
5. No Android, abrir as quatro categorias atualizadas, confirmar imagem principal e miniatura, títulos sem numeração e em caixa-alta, botões Abrir amarelos, capas em molduras, botão JOGAR alinhado ao centro abaixo das peças em Solo/Coop/Desafio. Finalizar **5/5** de uma categoria com conta e depois como visitante para verificar a celebração dourada, sem repetir à toa; confirmar que a 2 e a 3 desbloqueiam como antes e que as compras 4 e 5 não perderam estado. Testar abertura vertical 360°, animação de vitória, sons, encaixes, reconexão e "Minha imagem". Aprovação do proprietário no celular antes de outra rodada.

## 6. Contratos preservados

O encaixe `SNAP` e as duas versões de `tryLock` não foram tocados, assim como todos os eventos Socket.IO. XP continua somente em `payMatch`; gemas somente no servidor; migrações antigas imutáveis. O bate-papo continua por frases prontas, sem exposição de e-mail nem XP bruto de terceiros.

---

# HISTÓRICO PRESERVADO INTEGRALMENTE — CONTINUIDADE ANTERIOR DO GITHUB

# CONTINUIDADE — ESTADO ATUAL DO QUEBRA-CABEÇA A DOIS

**Atualizado em:** 30/10/2026 (horário de Fortaleza)  
**Rodada atual:** Biblioteca de imagens — 5 categorias, 25 ilustrações 3:4, progresso e gemas  
**Repositório:** `herbertttomes2028/QUEBRA-APK`  
**Commit da `main` lido e comparado antes da implementação:** `0c641ff44f7263a14d338d99265b18347c0336bc`  
**Árvore Git da `main` de referência:** `d4d4dbcd952ad3b5aa7459ab98328b39dcf497f0`.

> **ESTA É A SEÇÃO MAIS RECENTE.** Todo o `CONTINUIDADE.md` efetivamente presente na `main` de referência foi preservado integralmente abaixo da seção HISTÓRICO (blob original `46815ad3cac52f6d83bf6cf8e4ffb4b21b5d0305`). Antes de outra rodada, confirmar novamente a `main`. O assistente não publica, não faz Merge e não realiza deploy. Não começar outra rodada antes da validação em Android pelo proprietário.

## 1. Solicitação e referência aprovada

- O proprietário confirmou que a versão anterior do aplicativo ficou excelente e deve ser **preservada como referência**. Mantidas por completo as animações da abertura (360° em pé, texto suave), a vitória (pulo leve e flutuação), a subida de nível, encaixes, magnetismo, peças SVG, sons, botões, controles e UI de salas.
- Foi solicitada uma biblioteca de **cinco categorias temáticas e cinco imagens por categoria** (25), todas **3:4**, com progresso individual permanente, desbloqueio automático 1→2→3 e compras opcionais e independentes de 4 e 5.
- Categorias inspiradas nas ideias anteriormente reservadas: **fauna brasileira**, **natureza e biomas**, **espaço e ciência**, **cultura brasileira**, **mundos fantásticos**. Cada imagem foi criada como **ilustração autoral detalhada em WebP**, e não apresentada como fotografia/IA fotorealista; a escolha de ilustrações usa a alternativa expressamente autorizada pelo proprietário e reduz custos de memória no Android.

## 2. Conteúdo da biblioteca e preços

| Etapa | Categoria | 5 imagens | Condição |
| --- | --- | --- | --- |
| 1 | Fauna brasileira | Onça-pintada; Arara-azul; Tucano-toco; Capivara do Pantanal; Boto-cor-de-rosa | Livre desde o início |
| 2 | Natureza e biomas | Cachoeira amazônica; Dunas dos Lençóis; Cerrado florido; Reflexos do Pantanal; Araucárias na serra | Concluir 5/5 da etapa 1 |
| 3 | Espaço e ciência | Saturno e seus anéis; Astronauta explorador; Paisagem lunar; Nebulosa colorida; Planeta Terra | Concluir 5/5 da etapa 2 |
| 4 | Cultura brasileira | Frevo em movimento; Festa junina; Capoeira ao entardecer; Maracatu de cores; Renda do Nordeste | **25 gemas**, permanente |
| 5 | Mundos fantásticos | Dragão das montanhas; Castelo nas nuvens; Ilhas flutuantes; Bosque encantado; Baleia das estrelas | **40 gemas**, permanente e **independente** da 4 |

Preços calculados em relação à economia existente: partidas válidas de **12 peças dão 2 gemas**, sem contar bônus de nível. São cerca de 13 conclusões para 25 gemas e 20 para 40, ou menos com níveis. Não há compra real nem dinheiro; somente gemas gratuitas já ganhas jogando. Cada desbloqueio é definitivo por conta, debitado no máximo uma vez.

## 3. Integração preservando arquitetura

- **Galeria existente:** `public/game.js` mantém `openPick`, seleção de quantidade de peças, cartão inferior, modais, fluxo de Solo, Cooperativo, Desafio e “Minha imagem”. A biblioteca é uma navegação por categorias **dentro da mesma tela `screen-pick`**, e a galeria antiga está disponível em “Imagens clássicas e Minha imagem”. Sem outra tela duplicada, sem mexer na mecânica do jogo.
- **Compatibilidade com versões antigas:** `/api/config` ainda envia `images` somente com imagens clássicas, adicionando campo independente `library` com categorias e metadados. `game.js` novo as agrega para a seleção; clientes antigos não recebem imagens bloqueadas misturadas à galeria e continuam funcionando.
- **Servidor:** módulo novo `library.js` contém catálogo, regras de disponibilidade e serviços de compra/progresso. `server.js` verifica o acesso ao criar e reiniciar salas; `challenge.js` verifica ao criar Sala Desafio. Jogadores convidados podem acompanhar partidas criadas por colegas, sem compra forçada. Não foram alteradas funções de encaixe, `SNAP`, comandos de movimento ou pacotes de socket já existentes.
- **Conclusões e XP:** `accounts.js` registra uma imagem na tabela `library_clears` **dentro da mesma transação de `awardMatch`**, *somente* para conclusão legítima (`rw.earnedCompletion`), com chave única por usuário/imagem. XP continua vindo exclusivamente de `payMatch`. As partidas incompletas, desistências, derrotas sem completar e partidas inválidas por duração curta não liberam imagens.
- **Persistência:** contas autenticadas consultam o estado em `GET /api/acc/library`; o banco guarda permanentemente imagens completadas e categorias compradas. Visitantes guardam conclusão gratuita no `localStorage` deste aparelho; esse histórico local pode desaparecer ao limpar dados/reinstalar e não é transferido à conta automaticamente. Compras de gemas exigem sessão autenticada.
- **Compra atômica:** `POST /api/acc/library/unlock` autentica a sessão, trava `users` com `FOR UPDATE`, verifica o desbloqueio existente, consulta o saldo, insere em `library_unlocks` (chave única usuário/categoria) e debita `users.gems` na **mesma transação**. Reenvios e acessos simultâneos não devem cobrar duas vezes; se a conexão cair, o cliente consulta novamente o estado. Não se alteram as migrações anteriores nem `gem_events` (que registra somente créditos).
- **Migração nova e imutável:** `006_biblioteca.sql`, somente tabelas adicionais. Hash registrado em `tests/migrations.sha256.json`. O Render aplica com `db.migrate()` na inicialização; GitHub Actions testa no PostgreSQL 16 descartável. Não executar manualmente testes no Neon de produção.
- **Imagens:** 25 arquivos WebP completos em `public/biblioteca/`, **768 × 1024 pixels**; 25 miniaturas independentes em `public/biblioteca/mini/`, **240 × 320 pixels**. Proporção exata 3:4 nas duas versões. Arquivos completos juntos ≈ 0,56 MiB e miniaturas ≈ 0,10 MiB. Interface carrega inicialmente 5 capas/miniaturas e somente mais cinco ao abrir uma categoria; a imagem principal só é decodificada quando o jogador a escolhe, com botão de partida temporariamente desabilitado até o sucesso do carregamento. Nada de carregar 25 imagens grandes ao mesmo tempo. Falha de miniatura exibe imagem substituta sem quebrar navegação. Service worker v13 armazena biblioteca sob demanda e atualiza casca do aplicativo como um conjunto.
- **Segurança infantil:** bate-papo continua apenas com frases prontas; não há informações de e-mail, XP bruto de terceiros nem ranking público. Compras não aceitam preços do cliente, apenas IDs reconhecidos.

## 4. Arquivos exatos da rodada (65 arquivos)

**Arquivos existentes alterados (11):** `server.js`, `accounts.js`, `challenge.js`, `public/game.js`, `public/conta.js`, `public/index.html`, `public/style.css`, `public/sw.js`, `tests/migrations.sha256.json`, `tests/gemas-postgres.test.js` e `CONTINUIDADE.md` na raiz.

**Arquivos novos de código e banco (4):** `library.js` (raiz), `migrations/006_biblioteca.sql`, `tests/library.test.js`, `tests/library-postgres.test.js`.

**Imagens novas (50):** cinco originais para cada um dos prefixos `lib-fauna-`, `lib-biomas-`, `lib-espaco-`, `lib-cultura-` e `lib-fantasia-`, cada um numerado `01` a `05`, em `public/biblioteca/` e os mesmos 25 nomes em `public/biblioteca/mini/`. Extensão `.webp`.

**TOTAL: 65 arquivos** = 11 existentes + 4 novos de código/banco + 50 imagens. Nenhum arquivo antigo da pasta `public/imagens/` é substituído; nenhuma arte de peça SVG é modificada.

## 5. Testes e limitações (somente afirmações efetivamente executadas)

- Verificação de sintaxe com `node --check` em `server.js`, `accounts.js`, `challenge.js`, `library.js`, `public/game.js`, `public/conta.js` e `public/sw.js`: **aprovadas**.
- `node --test` em onze arquivos de testes independentes de conexões reais: **71 testes, 69 aprovados, 0 falhas, 2 pulados** (os dois PostgreSQL reais exigem `GEMAS_TEST_DB=1` e o banco temporário). `socket.io-client` ausente foi substituído **somente para carregar testes estáticos** por stub local que não realiza conexão de rede; não usar isso como prova de integração.
- Um Chromium real executou o **HTML/CSS/scripts reais** em um ambiente simulado com respostas de configuração/conta e miniaturas embutidas: **320×650, 360×740 e 412×915**, verificando cinco categorias, categoria 1 gratuita, abertura de cinco imagens, painel de peças, retorno de navegação, estado local de 5/5 liberando categoria 2, **compra simulada de categoria 5 sem comprar categoria 4** e seleção/carregamento das **25 imagens individuais**, com navegação Voltar preservada e sem erros JS observados. Este **não** é um servidor/jogo com Socket.IO nem compra real no PostgreSQL.
- Testes em Node verificaram todos os **25 arquivos principais 768×1024 e 25 miniaturas 240×320**, com bytes WebP válidos e limites de tamanho; 25 nomes distintos e progresso/condições corretos.
- **Não executados nesta rodada:** `npm test` completo com `socket.io-client` real, migração `006` e compras com PostgreSQL real, partida Solo/Coop/Desafio de ponta a ponta, Render/Neon, medição de FPS e Android físico. O GitHub Actions realiza a integração em banco isolado no PR; **não fazer Merge se ficar vermelho**. Teste real no Android só cabe ao proprietário.

## 6. Publicação controlada pelo proprietário

1. Criar nova branch a partir da `main` `0c641ff`, sugerida `biblioteca-categorias-progressao` (nunca enviar diretamente na `main`). Extrair ZIP e enviar **somente os 65 arquivos, preservando as subpastas**, incluindo `public/biblioteca/` e `public/biblioteca/mini/`.
2. No PR para `main`, conferir `Files changed`, especialmente todos os 50 WebP, migração 006 e a ausência de modificações em pastas de imagens antigas e regra de encaixe. O workflow `Gemas e regressao (PostgreSQL isolado)` deve ficar verde; investigar qualquer falha antes do Merge.
3. O proprietário executa Merge e deploy manual no Render. Antes de testar compras, verificar se `schema_migrations` do Neon inclui `006_biblioteca.sql` após o deploy; não rodar migração manual duas vezes e não executar testes de bancos descartáveis em produção.
4. No Android: abrir todas as categorias, completar cada uma das 5 imagens da etapa 1 e depois da etapa 2, testar 3, comprar separadamente 5 e depois 4, sair/reabrir app, conferir saldos, impedir compra duplicada, verificar visita/conta, “Minha imagem”, Solo/Cooperativo/Desafio, reconexão, controles, som e todas as animações já aprovadas. Repetir em celular mais lento; só após aprovação iniciar outra rodada.

## 7. Contratos imutáveis e ideias futuras

`tryLock` e `SNAP = Math.round(tile * .33)` duplicados em `server.js` e `challenge.js` devem continuar idênticos. XP apenas por `payMatch`, gemas somente do servidor, migrações antigas imutáveis; comunicação por frases prontas, nada de e-mail ou XP bruto de outros jogadores.

Ideias futuras **não implementadas** nesta rodada: álbum de medalhas/conquistas, personalizações com gemas, jornada de aventuras, desafios cooperativos especiais, curiosidades educativas e campeonatos amistosos. As coleções de imagens desta rodada não incluem compras individuais de imagens nem uma segunda central de recompensas (o perfil existente continua exibindo saldo/nível).

---

# HISTÓRICO PRESERVADO INTEGRALMENTE — CONTINUIDADE DA MAIN ANTERIOR

# CONTINUIDADE — ESTADO ATUAL DO QUEBRA-CABEÇA A DOIS

**Atualizado em:** 30/10/2026 (horário de Fortaleza)  
**Rodada:** correção da abertura — volta completa de 360° **no eixo vertical**, com texto suave  
**Repositório:** `herbertttomes2028/QUEBRA-APK`  
**`main` consultada e verificada antes de implementar:** `d2d0ddba26bfac03c0eec14a18261ac394f9ef0b`  
**Árvore Git da `main`:** `09c136fb8fd32a0043e1bb24961cf2d624db6bd5`

> **ESTA É A SEÇÃO ATUAL.** A seção anterior e todo o histórico foram preservados integralmente depois de "HISTÓRICO". Antes da próxima tarefa, ler este documento e confirmar de novo a `main` do GitHub. O assistente não publica, não faz Merge e não realiza deploy.

## 1. Pedido e diagnóstico

O proprietário esclareceu que "360°" significa **a fotografia girar em pé**, como um cartão que vira em torno de seu próprio **eixo vertical (Y)** — o efeito que existia antes das otimizações —, e **não** a rotação plana `rotate(-360deg)` introduzida na rodada imediatamente anterior. Ele também quer a entrada da frase **VAMOS LÁ!** mais lenta e sem o antigo salto abrupto, evitando travamentos.

## 2. Correção implementada nesta rodada

- **`public/style.css`**: `go-spin` restaurado para `rotateY(-360deg)` até `rotateY(0deg)`, mantendo **uma volta completa em 2,4 segundos**, escala discreta **0,97 → 1**, opacidade suave e nenhuma pulsação infinita. A rotação agora ocorre no eixo vertical, não no plano da tela. A propriedade `backface-visibility` passou de `hidden` para `visible` somente na carta `.go-card`, para que a imagem não desapareça durante a metade posterior da volta (o verso aparece espelhado, comportamento normal de uma carta de uma única face em CSS 3D).
- **Frase "VAMOS LÁ!"**: preservada a entrada de **1,3 segundo**, com atraso de **0,75 segundo**, deslocamento de **18 pixels** e escala inicial de **96%**, sem o antigo `go-slam` com aumento de 260%. Mantidos cores, fontes, sons, tela de abertura e imagem miniaturizada já otimizada.
- **`tests/desempenho.test.js`**: atualizado para assegurar o eixo **Y**, a volta completa, a apresentação do verso e a rejeição da rotação 2D; demais testes de performance e encaixe preservados.
- **`public/game.js` não mudou**: continua com a duração mínima **2,65 segundos**, suficiente para concluir o giro de 2,4 segundos, e o mesmo som, carregamento de imagem e fluxo de partida. Não foram alterados servidor, arquivos SQL, imagens SVG, posições, encaixe, Socket.IO, XP, gemas, animação de vitória aprovada ou animação de nível.

## 3. Arquivos exatos do pacote de correção

| Caminho no GitHub | Ação |
| --- | --- |
| `public/style.css` | substituir |
| `tests/desempenho.test.js` | substituir |
| `CONTINUIDADE.md` (raiz) | substituir |

**Total: 3 arquivos.** Criar uma nova ramificação, por exemplo `abertura-360-eixo-vertical`. Nunca enviar diretamente à `main`. Não reenviar arquivos de ZIPs anteriores. A base anterior foi comparada com os blobs da `main` atual: CSS `b14c690f1b306cada04656a68d184a4f23ee2bd2`; teste `21aa8450680f4b8dfedd31eca4f10864261f9a7a`; documentação `b82521bbf532a7303596aa128c544d9f7af8d56f`.

## 4. Testes realmente realizados

- `node --check public/game.js` e `node --check tests/desempenho.test.js`: **aprovados**.
- 8 arquivos de testes independentes, executados com Node: **64 aprovados, 0 falhas**. O módulo `socket.io-client` foi substituído por um stub **apenas para o carregamento de verificações estáticas**; nenhuma conexão real foi simulada por esse stub.
- **Chromium desktop com CSS real** em **320×650, 360×740 e 412×915 pixels**: confirmado `rotateY` com volta completa e duração de **2,4 s**, visibilidade da face traseira e entrada da frase com **1,3 s após 0,75 s**. O exame de matrizes de transformação confirmou mudança no eixo Y (não giro 2D). Em movimento reduzido, nenhuma animação é acionada.
- **Não executados:** Android real, medições de FPS ou travamento no celular, jogo real com Socket.IO/Render e suíte `npm test` completa com PostgreSQL. O GitHub Actions no novo PR deverá ficar verde antes do Merge; a aprovação visual e de desempenho depende do proprietário em Android real.

## 5. Publicação e aprovação no celular

1. Criar branch nova a partir da `main` verificada, sugerida `abertura-360-eixo-vertical`.
2. Substituir os **3 arquivos** nas pastas corretas; conferir em **Files changed** que há somente esses três. Abrir Pull Request para `main`.
3. Aguardar **Gemas e regressao (PostgreSQL isolado)** ficar verde. Não fazer Merge com teste vermelho.
4. O proprietário faz Merge e deploy manual no Render. Nenhuma migração Neon necessária.
5. Testar no Android: a imagem deve girar **em pé** uma volta completa, com a frase surgindo suavemente; verificar engasgos, som, tela de jogo, cancelamento, peças, XP e gemas. Só depois dessa validação considerar esta rodada aprovada e avançar para outra.

## 6. Contratos e ideias futuras

Manter `SNAP = Math.round(tile * .33)` e as duas cópias de `tryLock()`; eventos Socket.IO e migrações imutáveis; XP somente via `payMatch`; gemas concedidas apenas pelo servidor. Chat infantil exclusivamente com frases prontas, sem exposição de e-mail ou XP bruto de terceiros. Sugestões reservadas: imagens especiais desbloqueáveis, álbum de medalhas, personalização com gemas, jornada de aventuras, desafios cooperativos, curiosidades educativas e campeonatos amistosos. O perfil já mostra XP, nível, progresso e gemas — não duplicar.

---

# HISTÓRICO PRESERVADO — ANTERIOR A ESTA RODADA

# CONTINUIDADE — ESTADO ATUAL DO QUEBRA-CABEÇA A DOIS

**Atualizado em:** 30/10/2026 (horário de Fortaleza)  
**Rodada:** correção da abertura da partida — giro completo 360° e entrada suave do texto  
**Repositório:** `herbertttomes2028/QUEBRA-APK`  
**Commit `main` confirmado antes de implementar:** `8f3c0d9758b55f39fec8e4e84858516525bcfd6c`  
**Árvore Git confirmada:** `5061c9d9ad46ba25e7530e08e84d2f767fa01a0f`  

> **LEIA PRIMEIRO:** esta seção é a mais recente. O documento anterior está reproduzido integralmente abaixo, sem exclusões. Sempre reconferir `main` no GitHub antes de qualquer rodada; o assistente não tem permissão para fazer Merge nem deploy.

## 1. Pedido aprovado

O proprietário relatou que a versão com giro de 65° não atende ao visual desejado: a fotografia **precisa dar uma volta completa de 360°**, mas de forma mais lenta e sem travamentos. A entrada da frase **VAMOS LÁ!** ainda era brusca e provocava engasgos; foi solicitada desaceleração desse efeito. A conclusão com pulo leve e flutuação foi aprovada no Android e não deve ser modificada.

## 2. Implementação desta rodada

- **`public/style.css`**: a carta executa **360° completos em 2,4 s**, usando rotação **plana em 2D** (`rotate(-360deg)` até `rotate(0deg)`). É uma mudança deliberada de 3D para 2D: mantém a fotografia visível durante toda a volta e evita a renderização do verso e o efeito de perspectiva que pode custar mais no Android. Escala mínima 97%, máxima 100%, sem pulsação infinita.
- **`public/style.css`**: o texto **VAMOS LÁ!** deixou de iniciar em `scale(2.6)` com entrada brusca. Agora aparece por baixo com deslocamento vertical de **18 px**, escala de **96% a 100%**, e opacidade suave durante **1,3 s**, iniciando após **0,75 s**. Não anima fontes, sombras ou filtros diretamente.
- **`public/game.js`**: a duração mínima da apresentação, no modo normal, foi ajustada de **1,9 s para 2,65 s** para permitir que a volta completa de 2,4 s termine antes de abrir o tabuleiro. O modo de movimento reduzido continua com 1,1 s. O carregamento da miniatura já otimizada, áudio, mensagens da sala e botão cancelar não mudaram.
- **`tests/desempenho.test.js`**: testes de regressão atualizados para exigir 360°, 2,4 s, texto mais lento, ausência do salto 2,6x e início de partida após a animação.
- **Não alterados:** `public/index.html`, SVG das peças, magnetismo/rotação de peças, conclusão de vitória, subida de nível, XP, gemas, contas, sockets, PostgreSQL, migrações, `server.js`, `challenge.js`, sons e visual fora da abertura.

## 3. Arquivos exatos do ZIP

| Pasta/caminho no GitHub | Ação |
| --- | --- |
| `public/style.css` | substituir |
| `public/game.js` | substituir |
| `tests/desempenho.test.js` | substituir |
| `CONTINUIDADE.md` (raiz) | substituir |

**Total: 4 arquivos.** Não adicionar outras versões antigas ao pacote. A base local dos três arquivos de código foi conferida por SHA de blob Git e coincide com a `main` verificada acima. O documento base, `CONTINUIDADE.md`, foi extraído do ZIP da rodada anterior e seu SHA Git `74f3211b4129b598e8c6d072c9e3f7c6689d1afd` corresponde exatamente à `main` atual.

## 4. Testes realmente executados

- `node --check public/game.js` e `node --check tests/desempenho.test.js`: aprovados.
- Oito grupos de testes independentes com Node, incluindo regressões de desempenho, SVG, encaixe, XP, gemas, sons, celebração e contratos: **64 testes aprovados, 0 falhas**. Para carregar contratos estáticos, foi usado um stub local de `socket.io-client`; testes com rede real não foram executados neste ambiente.
- Chromium desktop (CSS real, abertura simulada): verificações em **320×650, 360×740 e 412×915 px**, confirmando uma única rotação de 360° por 2,4 s, entrada do texto por 1,3 s com atraso de 0,75 s, sem escala de 2,6x. Com `prefers-reduced-motion: reduce`, nenhuma dessas animações é iniciada. Não é medição de FPS nem um teste Android.
- **Não executados:** `npm test` completo com Socket.IO real, PostgreSQL integrado, Render, Neon e Android real. Exigir GitHub Actions verde no PR e avaliação no celular antes de aprovar esta rodada.

## 5. Publicação e teste no Android

1. Criar nova ramificação da `main`, sugerida `abertura-360-texto-suave`. Substituir apenas os quatro arquivos nos caminhos listados.
2. Abrir PR para `main`; conferir **Files changed** com exatamente quatro arquivos. Aguardar o workflow **Gemas e regressao (PostgreSQL isolado)** verde; não fazer Merge em caso de falha.
3. Só o proprietário faz Merge e deploy manual no Render. Não há migração SQL nova.
4. No Android, abrir partidas Solo, Cooperativo e Desafio, observar se a imagem faz **uma volta de 360° fluida**, se **VAMOS LÁ!** entra sem engasgos e se a partida só aparece após a apresentação. Confirmar imagem, som, botão cancelar, XP/gemas e conclusão do jogo. Se travar, considerar reduzir outros efeitos de abertura sem modificar o tabuleiro.
5. Apenas após a aprovação do proprietário iniciar outra rodada.

## 6. Segurança e contratos permanentes

Respeitar as cópias de `tryLock()` e `SNAP = Math.round(tile * .33)` no servidor e Desafio; XP pago somente por `payMatch`, gemas pelo servidor, migrações anteriores imutáveis, sem texto livre no bate-papo nem dados privados de jogadores. Não executar testes destrutivos no Neon de produção.

## 7. Ideias futuras reservadas

Manter as sugestões já registradas no histórico: imagens especiais desbloqueáveis, conquistas e medalhas, personalizações cosméticas com gemas, jornada de aventuras, curiosidades educativas, desafios cooperativos e campeonatos amistosos. O perfil já reúne nível, XP, gemas e progresso; não duplicar a tela de recompensas.

---

# DOCUMENTO ANTERIOR — PRESERVADO INTEGRALMENTE PARA HISTÓRICO

# CONTINUIDADE — ESTADO ATUAL DO QUEBRA-CABEÇA A DOIS

**Atualizado em:** 30/10/2026 (horário de Brasília)  
**Rodada atual:** Ajuste da animação de entrada da partida — giro menor e mais lento  
**Repositório:** `herbertttomes2028/QUEBRA-APK`  
**`main` verificada antes da implementação:** `3dea4b7d51036949e4cfe4276c9a05b10b04efe8`  
**Árvore da `main` de referência:** `219533050573d3eb381713d913fca111fac92c41`

> **ESTA É A SEÇÃO MAIS RECENTE.** O histórico abaixo conserva os documentos das rodadas anteriores. Antes de qualquer nova tarefa, ler o documento e conferir novamente a `main` do GitHub; não partir de ZIPs antigos. O assistente não publica nem faz deploy.

## 1. Situação aprovada e novo pedido

- O proprietário **aprovou no Android** a celebração de conclusão com zoom mínimo (até 6%) e flutuação; essa funcionalidade está preservada.
- Novo pedido: ao iniciar uma partida, a imagem da abertura girava demais e engasgava no Android. Foi solicitada uma rotação **menor e mais lenta**, sem interferir no jogo.
- A origem provável do custo excessivo era a animação `go-spin`: giro de **−900° em 1,25 s**, começando em **15%** de escala, com uma segunda animação de pulsação **infinita**. Isso não prova a causa específica do travamento no aparelho; é uma redução preventiva de trabalho gráfico.

## 2. Alteração feita nesta rodada

- **`public/style.css`**: `go-spin` começa em `rotateY(-65deg) scale(.9)` e termina em `rotateY(0) scale(1)`, em **1,7 segundo**; opacidade inicial de 0,55, atingindo 1 no início. A carta recebe `backface-visibility: hidden` para evitar desenhar o verso durante o giro 3D.
- Removida a **pulsação infinita** da carta de abertura. A carta termina imóvel até a partida começar. Permanecem o título **VAMOS LÁ!**, som `tann`, luzes e aparência estática, miniatura já preparada e botão de cancelar.
- **`tests/desempenho.test.js`**: atualizadas as verificações do novo ângulo, duração, escala inicial e fim da pulsação; confirma que o período mínimo existente da abertura é **1,9 segundo** no modo normal e que o uso de `will-change` continua restrito à animação.
- **Nenhuma alteração no `public/game.js`**, em modos de jogo, Socket.IO, geometria das peças, magnetismo, níveis, XP, gemas, PostgreSQL ou migrações. Nenhuma alteração em HTML, sons ou layout fora da abertura.

## 3. Arquivos exatos do pacote

| Caminho no GitHub | Ação |
| --- | --- |
| `public/style.css` | substituir |
| `tests/desempenho.test.js` | substituir |
| `CONTINUIDADE.md` (raiz) | substituir |

**Total de 3 arquivos.** Não enviar outros arquivos de pacotes antigos. O arquivo `CONTINUIDADE.md` contém todo o histórico anterior abaixo.

## 4. Testes efetivamente realizados

- Hashes Git comparados contra `main` de `3dea4b7`: `public/style.css` (`ddeaba8581708a9e8e56813ec12fdd0a46ee67f9`), `tests/desempenho.test.js` (`d6a5716b5b3a4b677b9422efac92582e4f984a87`) e `public/game.js` (`d2fee8cea60454f9ebd7a274ec6345f83ecef91e`). O jogo permanece sem alterações de JS nesta rodada.
- `node --check public/game.js`: aprovado no código da base atual; `node --test` em oito arquivos independentes de testes: **64 aprovados, nenhuma falha**. Para carregar testes puramente estáticos foi utilizado um stub local de `socket.io-client`, que não simula conexões reais.
- Chromium real (navegador desktop) com o **CSS real do jogo** e a tela de abertura simulada: **320 × 650, 360 × 740, 412 × 915 px**, cada um confirmou **uma animação de 1,7 s sem repetição**; em `prefers-reduced-motion: reduce`, a animação não foi iniciada.
- **Não testados:** Android real nesta rodada, fluidez/FPS no aparelho do proprietário, partida completa com servidor/Render, suíte completa com Socket.IO real e PostgreSQL. O teste SQL isolado do GitHub Actions deve ser aprovado no Pull Request antes do Merge.

## 5. Próximos passos do proprietário

1. Criar nova ramificação da `main` no GitHub, sugerida `entrada-giro-suave`, e enviar apenas os três arquivos, respeitando as pastas.
2. Abrir Pull Request para `main`, conferir em **Files changed** somente esses três arquivos e aguardar **Gemas e regressao (PostgreSQL isolado)** ficar verde.
3. Só então fazer o Merge e o deploy manual no Render. Não é necessária nova migração no Neon.
4. Testar no **Android real** a abertura de partidas Solo, Cooperativa e Desafio (quando a abertura surgir), especialmente em 6 e 12 peças. Verificar que o giro é curto, mais lento e sem engasgos; confirmar som, resultado de vitória, XP/gemas e controles. A rodada só será aprovada após o relato do proprietário.

## 6. Restrições permanentes e ideias futuras

- Manter as duas cópias de `tryLock()`, a regra de encaixe `SNAP = Math.round(tile * .33)`, eventos Socket.IO, migrações imutáveis e XP exclusivamente por `payMatch`.
- Gemas somente pelo servidor; bate-papo infantil exclusivamente por frases prontas; nunca expor e-mail ou XP bruto de outros jogadores.
- Ideias futuras reservadas, **não implementadas**: coleções de imagens desbloqueáveis, medalhas e conquistas mais bonitas, personalizações com gemas, jornada de aventuras, desafios cooperativos, curiosidades educativas e campeonatos amistosos. O perfil já tem XP, gemas e progresso; não duplicar essas telas.

---

# HISTÓRICO PRESERVADO — RODADAS ANTERIORES

# CONTINUIDADE — ESTADO ATUAL DO QUEBRA-CABEÇA A DOIS

**Atualizado em:** 31/10/2026  
**Rodada atual:** 3C — animação de vitória com pulo mínimo e flutuação  
**Repositório:** `herbertttomes2028/QUEBRA-APK`  
**`main` verificada antes da implementação:** `b2a30cc2b2fc871da28e0ba5a2f280954a7c03c5`  
**Árvore Git de referência:** `8c78a40a856a05dca732836a5284c8d32b805783`

> **ESTE É O REGISTRO MAIS RECENTE.** As seções abaixo de “HISTÓRICO” descrevem rodadas anteriores e permanecem para consulta. Antes de qualquer nova modificação, verificar novamente o commit e os arquivos da `main`. O assistente não publica no GitHub, não faz Merge e não realiza deploy.

## 1. O que foi solicitado e aprovado

Após testar no Android as animações anteriores, o proprietário informou que o zoom e o deslocamento da imagem estavam exagerados. A nova solicitação aprovada é **um pequeno pulo (zoom discreto) da imagem montada, seguido de flutuação suave no mesmo lugar**, com borda e reflexo dourados, e apresentação do resultado ao final. A conclusão não deve lançar a imagem até o centro, nem transportá-la para o cartão de resultados.

## 2. Implementação da rodada 3C

- `public/game.js`: na função `showVictoryResult`, removidas as medições da posição do cartão de resultado e os deslocamentos da imagem para outro lugar da tela. A foto permanece na posição da grade, com **escala máxima 1,06 (aumento de 6%)**, pequenos deslocamentos **verticais entre -3 e -8 pixels**, e seis quadros de animação por **2,3 segundos**. Ao final, a camada some e o resultado já existente aparece com XP, gemas e ações normais.
- `public/style.css`: apenas o `transform-origin` da foto da celebração passou a `center center` para que o pequeno zoom não a empurre lateralmente. Brilho dourado e reflexo continuam.
- `tests/vitoria-animacao.test.js`: valida o limite de zoom de 6%, ausência de movimento horizontal, duração, abertura do resultado depois da celebração, toque para pular, movimento reduzido, cancelamento e Desafio.
- **Nenhuma mudança** em `public/index.html`, SQL, `accounts.js`, `gems.js`, `server.js`, `challenge.js`, geometria SVG, regras de encaixe, sons, eventos Socket.IO ou XP. Sem nova migração.
- **A animação de subida de nível** continua ocorrendo somente após voltar à tela inicial. O saldo de gemas e XP permanece sob autoridade do servidor.

## 3. Arquivos EXATOS do pacote

| Caminho | Operação |
| --- | --- |
| `public/game.js` | substituir |
| `public/style.css` | substituir |
| `tests/vitoria-animacao.test.js` | substituir |
| `CONTINUIDADE.md` | substituir na raiz |

**Total: quatro arquivos**. Não enviar outros arquivos de ZIPs antigos.

## 4. Testes realmente executados

- `node --check public/game.js` e `node --check tests/vitoria-animacao.test.js`: aprovados.
- `node --test` em oito arquivos independentes de testes (contratos, desempenho, gemas, histórico e sons, níveis, rotação visual, vitória, XP): **64 testes aprovados**, nenhuma falha. `socket.io-client` foi carregado por um stub **somente para testes estáticos**; isso não substitui testes de rede reais.
- Chromium real, usando o trecho atual de `showVictoryResult` e CSS completo do jogo em ambiente de tela simulado, tamanhos **320 × 650, 360 × 740 e 412 × 915**: verificou imagem única, zoom discreto, eixo horizontal estável, abertura do cartão ao final e **zero erros JavaScript observados**.
- **Não executados aqui:** `npm test` completo com rede/Socket.IO, integração PostgreSQL, Render ou Android real. Exigir GitHub Actions verde no novo PR e teste de fluidez no Android antes de aprovar a rodada.

## 5. Publicação e validação

1. Criar uma ramificação nova da `main`, sugerida `vitoria-pulo-flutuante`. Usar os **quatro arquivos** listados acima, preservando os caminhos.
2. Abrir PR com base `main`, comparar Files changed (apenas quatro), aguardar o workflow **Gemas e regressao (PostgreSQL isolado)** finalizar verde. **Se falhar, não mesclar.**
3. O proprietário faz Merge e deploy manual no Render; o assistente não faz nenhuma operação de escrita no GitHub.
4. Validar no Android Solo, Cooperativo e Desafio (vitória por completar, derrota), tocar para pular, movimento reduzido, travamento em 6/12 peças, resultado e créditos de XP/gemas. Só após aprovação começar outra rodada.

## 6. Contratos e segurança permanentes

Preservar as duas cópias de `tryLock()` e `SNAP = Math.round(tile * .33)`, os eventos de Socket.IO, as migrações imutáveis e a regra de XP **somente por `payMatch`**; gemas são creditadas no servidor. Bate-papo infantil só com frases prontas; nunca expor e-mail nem XP bruto de terceiros. Nenhum teste destrutivo deve tocar o Neon de produção. O perfil já apresenta saldo, XP, nível e progresso, portanto não criar tela duplicada.

## 7. Ideias futuras reservadas, ainda não implementadas

Coleções de imagens desbloqueáveis; medalhas/conquistas visuais; personalizações cosméticas com gemas; jornada de aventuras; desafios cooperativos especiais; curiosidades educativas; campeonatos amistosos. O proprietário pediu para preservar essas ideias, sem começar outra rodada antes de validar esta.

---

# HISTÓRICO DAS RODADAS ANTERIORES — ARQUIVO PRESERVADO

# CONTINUIDADE — ESTADO ATUAL DO QUEBRA-CABEÇA A DOIS

**Atualizado em:** 31/10/2026  
**Rodada 3B:** Ajuste da Celebração de Vitória 2.0 — imagem avança em direção à tela, dura mais e só depois entra no resultado  
**Repositório:** `herbertttomes2028/QUEBRA-APK`  
**`main` consultada antes da implementação:** `be74ebbf73d1585f3475e9b1b5fd4fdc3fb4daf7`  
**Árvore Git original:** `be74ebbf73d1585f3475e9b1b5fd4fdc3fb4daf7`.

> **LEIA PRIMEIRO:** esta seção descreve o pacote novo (ainda não publicado). O texto das rodadas antigas foi preservado integralmente abaixo apenas como histórico. Antes de qualquer nova tarefa, verificar novamente a `main` e seus arquivos. O assistente não tem permissão para publicar, mesclar PR ou realizar deploy.

## 1. Aprovação do proprietário e objetivo

- **Rodadas 1 e 2 aprovadas no Android pelo proprietário:** animação de subida de nível após voltar à tela inicial, XP e gemas no resultado e no perfil. GitHub Actions com PostgreSQL real foi confirmado verde no PR; o proprietário verificou no Neon `gem_events` e `users.gems` e informou que XP, gemas e jogo funcionam no Android.
- **Rodada 3 original foi mesclada na `main`, mas o proprietário relatou comportamento visual invertido:** a imagem saía rápido da tela, em vez de avançar em direção ao jogador. Também pediu cerca de **+1 segundo** na celebração antes de exibir o resultado.
- **Rodada 3B aprovada para correção:** manter o brilho da última peça; fazer a imagem concluída crescer e vir ao centro da tela, segurar por mais tempo com contorno dourado suave e só então se acomodar no cartão de resultado.
- Evitar travamentos: continuar sem confetes pesados, sem blur e sem animar peças SVG individuais. A animação de **nível** segue apenas na home; XP/gemas continuam vindo do servidor.

## 2. Escopo técnico da Rodada 3B

- `public/game.js`: `flashLastSnap` continua iluminando só a borda da grade por 0,4 s (sem animar peças); `showVictoryResult` mantém a medição do tabuleiro/resultado, porém o voo agora usa **cinco quadros**: origem na grade, aproximação ao centro, sustentação breve em destaque e acomodação final no cartão. A duração passou para **2,26 s** (antes 1,22 s), com limite de **2,8 s** antes de abrir o resultado. Isso corrige o movimento invertido percebido no Android e deixa a celebração mais legível. Permite tocar para pular; se o jogador sai, cancela; se perde foco/redimensiona, conclui a abertura do resultado. Sem suporte a animação/movimento reduzido, exibe imediatamente a janela. XP/gemas surgem com `refreshXp` a partir de eventos do servidor, nunca por novo pagamento.
- **Solo e Cooperativo:** a imagem completa vai do tabuleiro à janela `#modal-win`; medalha dourada compacta, sem confetes nem desfoque; ações originais de salvar, compartilhar, jogar de novo e trocar imagem mantidas.
- **Desafio:** somente vitória por conclusão própria (`winner === idx` e `reason === 'complete'`) mostra a imagem voando e adiciona imagem pequena ao resultado; derrota ou vitória por abandono preserva o resultado sem celebrar uma imagem não concluída. Revisitar o resultado no lobby continua possível.
- `public/index.html`: overlay `#victory-flight`, medalha e imagem opcional do Desafio; sem scripts inline nem arquivos de arte adicionais.
- `public/style.css`: borda/reflexo dourados usando `opacity` e `transform`, com pouca decoração e **sem** blur, filtros pesados ou confetes; contornos da grade somem **somente após a vitória**, sem tocar na geometria das peças; movimento reduzido respeitado.
- **Nenhum arquivo** de `server.js`, `challenge.js`, `accounts.js`, `gems.js`, `xp.js`, SQL, fluxos de socket, migrações, formatos SVG ou cálculo de magnetismo foi modificado.

## 3. Conteúdo exato do pacote — caminhos relativos à raiz

| Caminho | Operação | Motivo |
| --- | --- | --- |
| `public/game.js` | substituir | Novo fluxo de animação, cancelamento, acessibilidade |
| `public/index.html` | substituir | Elementos visuais leves da vitória |
| `public/style.css` | substituir | Efeitos dourados e estilos do resultado |
| `tests/desempenho.test.js` | substituir | Teste antigo exigia os 44 confetes e o blur; atualizado para verificar que foram retirados, preservando geometria/SNAP |
| `tests/vitoria-animacao.test.js` | substituir | Ajusta os testes para a nova duração e o novo número de quadros da animação |
| `tests/contratos.test.js` | substituir | Corrige o contrato do botão X para aceitar o cancelamento explícito da animação antes de sair |
| `CONTINUIDADE.md` | substituir | Este registro e o histórico preservado |

**Nenhum arquivo de banco de dados** nesta rodada; não há migração SQL nova. A versão de referência é a `main` já com a celebração anterior mesclada, não os ZIPs antigos.

## 4. Testes executados e limitações

- `node --check public/game.js`: **aprovado**.
- `node --test tests/vitoria-animacao.test.js tests/contratos.test.js`: **8 aprovados, 0 falhas**. Incluem toque para pular, movimento reduzido, derrota no Desafio, cancelamento ao sair, fallback sem tabuleiro e o contrato atualizado do botão X.
- Revisão lógica do novo cálculo de escalas/deslocamentos: a imagem primeiro cresce rumo ao centro da tela, permanece brevemente em destaque e só depois reduz para o cartão de resultado. **Não** constitui teste de partida real com servidor, Android ou medição de FPS.
- `npm test` completo **não foi executado** neste ambiente por limitações de dependências externas. O próximo PR deve ser validado pelo GitHub Actions antes do Merge.
- O workflow existente `.github/workflows/gemas-postgres.yml` roda `npm ci`, migrações e `npm test` ao abrir o Pull Request: **verificar resultado verde do novo PR antes de Merge**. Nenhum teste desta rodada foi executado no Render/Neon ou em Android real pelo assistente.

## 5. Publicação / confirmação no celular

1. Criar **nova ramificação** da `main`, por exemplo `ajuste-celebracao-vitoria`; enviar só os cinco arquivos acima nos caminhos exatos e abrir PR para `main`.
2. Revisar Files changed (somente cinco arquivos) e **aguardar GitHub Actions verde**; se falhar, não mesclar. Verificar se a `main` não mudou desde `be74ebb` antes de aplicar o pacote.
3. Proprietário faz Merge e **Manual Deploy no Render** (não executados pelo assistente).
4. Android real: concluir partidas de 6, 12, 20, 30 e 48 peças, especialmente as que travavam; repetir em Solo, Cooperativo, Desafio (vitória/derrota/desistência), movimento reduzido e botão de pular. Confirmar que XP e gemas continuam corretos, que resultado pode ser fechado/reaberto e que a celebração de nível só surge na home.
5. Só após aprovação no Android iniciar outra rodada. Se houver engasgos, ajustar ou simplificar o visual sem tocar no SNAP/rotacionamento das peças.

## 6. Melhorias futuras guardadas (propostas, NÃO implementadas)

O proprietário pediu para manter estas ideias para futuras rodadas, sem criar telas duplicadas: **o perfil já contém nível, progresso, XP e gemas**.

1. **Coleções temáticas de quebra-cabeças:** animais brasileiros, natureza, espaço e cultura; imagens especiais desbloqueáveis com gemas, permanentes, sem retirar as gratuitas.
2. **Álbum de conquistas/medalhas:** valorizar conquistas já existentes, depois incluir novas e recompensas de gemas únicas por conquista.
3. **Personalizações com gemas:** molduras de perfil, temas/fundos, efeitos decorativos sem alterar formatos SVG ou encaixe.
4. **Jornada de aventuras:** mapas, mundos e etapas progressivas como modo adicional e opcional.
5. **Desafios especiais cooperativos:** objetivos de dupla e medalhas compartilhadas, com recompensas individuais e chat apenas por frases prontas.
6. **Conteúdos educativos:** curiosidades curtas sobre animais, natureza, geografia e cultura após a conclusão.
7. **Campeonatos amistosos:** séries de quebra-cabeças e medalhas sem ranking público invasivo nem pressão de tempo de tela.

**Não há loja nem gasto de gemas implementados.** Qualquer débito futuro deverá ser autorizado/registrado pelo servidor e validado em PostgreSQL isolado. Proteger crianças: nunca expor e-mail ou XP bruto de terceiros, não permitir bate-papo livre.

## 7. Contratos obrigatórios nas próximas rodadas

- `SNAP = Math.round(tile * .33)` e `tryLock()` duplicados em `server.js`/`challenge.js`, sem mudanças de orientação, encaixe, socket ou geometria SVG.
- XP apenas por `payMatch`; gemas concedidas no servidor, sem pagamento na interface.
- Migrações anteriores imutáveis. Não testar operações destrutivas no Neon de produção.
- Entrega somente ZIP de arquivos alterados + `CONTINUIDADE.md`, PR em ramificação nova, Merge e deploy manuais, teste Android por quem tem o aparelho.

---

# HISTÓRICO — CONTINUIDADE DAS RODADAS 2, 1 E DOCUMENTO ORIGINAL

> O texto abaixo é histórico, preservado para rastreabilidade. Seus commits e status não substituem a seção atual acima.

# CONTINUIDADE — ESTADO ATUAL DO QUEBRA-CABEÇA A DOIS

**Atualizado:** 30/10/2026 · **Rodada 2: gemas gratuitas por conclusão e nível**  
**Repositório:** `herbertttomes2028/QUEBRA-APK`  
**Base verificada da `main`:** `e5e39fc9e8539ea3f16eba2498aaf99cc67557fe`  
**Árvore da base GitHub:** `76c2858f0e91f9451e2e6abdc1e3478a6439a872`.

> ATENÇÃO: este arquivo foi gerado junto com o ZIP da Rodada 2. **Não está no GitHub até o proprietário enviá-lo**, nem é memória automática do ChatGPT. Conferir a `main` novamente antes de uma nova rodada. Abaixo dele estão os documentos anteriores preservados, que são históricos. Não confundir os commits antigos com o estado atual.

## 1. O que existe nesta entrega

- Gemas **gratuitas**, somente para contas autenticadas, sem loja, compras, dinheiro real ou gastos.
- Bônus por conclusão válida: **6 peças = 1**, **12 = 2**, **20 = 3**, **30 = 5**, **48 = 8** gemas. Partidas Solo, Cooperativas e Desafio passam pelo mesmo pagamento `payMatch` já existente. No Desafio, somente o jogador que **concluiu** ganha as gemas de conclusão; só vencer ou participar não basta.
- A conclusão deve atender ao **tempo mínimo plausível** já exigido pelo XP (`xp.js`, `matchReward.earnedCompletion`); conclusão inválida/rápida não credita gemas.
- Bônus por novo nível: **2–9 = 10**, **10–19 = 15**, **20–29 = 20**, **30–49 = 30**, **50–100 = 50** gemas **por nível efetivamente atravessado**. Até níveis alcançados por XP de conquistas/amigos podem dar bônus. Níveis anteriores à instalação **não dão crédito retroativo**.
- `users.gems` guarda o saldo e `gem_events` guarda a trilha de créditos. `UNIQUE(user_id, ref)` garante **uma vez por partida** e **uma vez por nível**. `UPDATE users SET gems = gems + ...` ocorre na mesma **transação SQL do XP**, com `SELECT ... FOR UPDATE` já existente em `awardMatch/awardAchievements`. Ao repetir o pagamento, a mesma partida não credita gemas novamente.
- O servidor mantém o controle do crédito, o navegador apenas recebe o saldo **privado** em `/api/acc/me` e no evento `acc:ev` de XP. Nenhuma rota aceita saldo ou premiação informados pelo cliente. Saldo mostrado na tela inicial e no perfil; gemas da conclusão no resultado; bônus de nível somente na celebração que aparece após retornar à tela inicial. O aviso de nível segue guardado no armazenamento local por código de conta; eventos fora de ordem não reduzem o saldo visual.
- A migração `005_gemas.sql` é **aditiva**. As migrações anteriores `001`–`004` continuam imutáveis. O arquivo `tests/migrations.sha256.json` ganha apenas o hash da migração 005.

## 2. Arquivos a enviar (relativos à raiz)

| Arquivo | Operação |
| --- | --- |
| `accounts.js` | substituir |
| `gems.js` | adicionar |
| `migrations/005_gemas.sql` | adicionar |
| `public/conta.js` | substituir |
| `public/game.js` | substituir |
| `public/index.html` | substituir |
| `public/style.css` | substituir |
| `tests/migrations.sha256.json` | substituir |
| `tests/nivel-celebracao.test.js` | substituir (regra nova para aviso pendente de bônus) |
| `tests/gemas.test.js` | adicionar |
| `tests/gemas-postgres.test.js` | adicionar |
| `.github/workflows/gemas-postgres.yml` | adicionar |
| `CONTINUIDADE.md` | adicionar na raiz; preservar esta versão na memória do projeto, se desejado |

**Não alterados:** `server.js`, `challenge.js`, `xp.js`, `db.js`, `package.json`, scripts de migração, migrações anteriores, geometria das peças, `SNAP` e as duas versões de `tryLock`, bate-papo de frases prontas, regras de XP e demais modos.

## 3. Testes / restrições de publicação

- A base foi comparada ao GitHub `main` no commit acima antes da implementação; inclusive `public/game.js` da Rodada 1, já mesclada na `main` pelo PR #15. `CONTINUIDADE.md` anterior **não** havia sido enviado à `main`, por isso esta entrega o inclui.
- Locais: testes Node sem dependências externas (tabelas, simulação de créditos, contratos, SVG e animação); ver resumo na resposta de entrega. Em Chromium local, renderizações com API e socket **simulados**, incluindo 320x550 e 360x740, também validadas.
- **PostgreSQL real NÃO executado neste ambiente.** Sem pacote instalado/servidor e sem acesso disponível ao Debian/npm. Não confundir testes simulados com SQL real.
- Incluído fluxo GitHub Actions `.github/workflows/gemas-postgres.yml`: ao abrir **Pull Request para `main`**, cria um PostgreSQL 16 descartável com `qc/qc_test` e `DATABASE_URL=postgresql://qc:qc@127.0.0.1:5432/qc_test`, executa `npm ci`, `npm run migrate` e `npm test`. O teste `tests/gemas-postgres.test.js` valida migrações, créditos, UNIQUE, rollback e concorrência com o **PostgreSQL verdadeiro**. Esse teste só é habilitado por `GEMAS_TEST_DB=1` e **recusa qualquer banco que não seja `localhost/qc_test`**. Jamais usar Neon de produção para testes destrutivos.
- **A execução do GitHub Actions ainda NÃO ocorreu** porque o assistente não tem permissão de publicar. O proprietário deve confirmar no PR que o check está **verde** antes do Merge. Em caso de falha, não fazer Merge/deploy até corrigir e reexecutar.
- Nem Render, Neon, nem Android real foram testados pelo assistente. O teste Android só conta depois da validação do proprietário. A migração 005 será aplicada no deploy pelo mecanismo existente de inicialização; verificar logs do Render e saldo de conta no aparelho.

## 4. Procedimento e próxima rodada

1. Confirmar `main` atual antes de cada novo pacote; `/home/claude/repo` pode conter cópia anterior, nunca confiar sem comparar com GitHub. Modificar somente arquivos da tarefa.
2. Proprietário cria **ramificação nova**, envia somente os 13 arquivos acima mantendo os caminhos, abre PR para `main`.
3. Aguardar GitHub Actions validar o PostgreSQL temporário e o conjunto de testes; revisar mudanças do PR e **não mesclar se houver erro**.
4. Proprietário faz Merge, deploy **manual** no Render e teste no Android. Assistente não faz GitHub write, deploy nem testes Android real.
5. Conferir Solo, Cooperativo e Desafio: uma única recompensa válida por partida, sem gemas por derrota incompleta; barra de XP, animação da medalha só após voltar à home, saldo privado consistente.
6. Após aprovação, poderá haver melhorias visuais ou de economia, mas **loja e gasto de gemas continuam fora de escopo até nova autorização**.

## 5. Contratos inegociáveis

Preservar `SNAP = Math.round(tile * .33)` nas duas cópias, `tryLock` em `server.js` e `challenge.js`, eventos Socket.IO existentes, migracões imutáveis, XP somente pelo `payMatch`, privacidade (nunca mostrar e-mail ou XP bruto de terceiros), bate-papo exclusivamente por frases prontas. Não mexer em partes já funcionais sem necessidade. Sempre entregar ZIP com `CONTINUIDADE.md`, lista exata de arquivos, testes executados/não executados e instruções de ramificação nova.

---

# HISTÓRICO DA RODADA 1 E DOCUMENTO DE 28/10/2026 (PRESERVADO)

> O conteúdo a seguir foi gerado antes da Rodada 2. Suas seções sobre gemas como "não implementadas" e suas regras de aprovação anteriores são **históricas e foram substituídas** pelas informações acima.

# CONTINUIDADE — ESTADO ATUAL E PRÓXIMA RODADA

**Atualizado em 30/10/2026 · Rodada 1: animação de subida de nível**  
**Repositório:** `herbertttomes2028/QUEBRA-APK`  
**Ramificação usada como base:** `main` · **commit:** `b37097ca02d14146f177ae178663d38ae680b53b`  
**Árvore Git verificada da base:** `d829470bc6a645de7f833daec988c33ffb1bfb93`.

> **IMPORTANTE:** este arquivo vem junto com o ZIP para ser publicado na nova ramificação. **Não está publicado pelo assistente**, nem representa um commit posterior. A `main` deve ser conferida novamente antes de qualquer nova rodada; o commit acima é a base desta entrega, não uma promessa de que continuará sendo o mais recente. O documento de 28/10, preservado integralmente após este adendo, é histórico: seus totais de arquivos, linhas, funcionalidades pendentes e commit `9c0471b` não representam a `main` em 30/10.

## A. Resultado da rodada atual — ANIMAÇÃO DE NÍVEL (aguarda validação do usuário)

**Escopo aprovado:** animação mais sofisticada, com medalha dourada, estrela, brilhos leves, efeitos de entrada, som e botão CONTINUAR. A nova celebração **somente aparece na tela inicial**, depois de o resultado e o fluxo da partida terem terminado. Suporta movimento reduzido, leitores de tela e botão Voltar do Android. Não há números de gemas nem loja nesta rodada.

**Arquivos alterados, relativos à raiz do repositório:**

| Arquivo | Mudança |
| --- | --- |
| `public/game.js` | remove o temporizador que exibia subida de nível durante o resultado; salva um aviso local pendente `qc.levelPending.<codigo_da_conta>` quando chega evento de XP do servidor, preserva-o em reload e exibe apenas quando `home`, fora de partida, fora de duelo, sem loading e sem janela aberta; exige nível confirmado na conta; ao fechar consome o aviso; troca/logout da conta não o exibe; botão e voltar fecham o diálogo |
| `public/conta.js` | informa ao mecanismo de celebração o código/nível da conta autenticada e o limpa no logout |
| `public/index.html` | novo diálogo acessível de nível, com medalha, fitas, partículas decorativas e CONTINUAR |
| `public/style.css` | arte CSS da comemoração e opção de movimento reduzido; não modifica os estilos nem a geometria das peças |
| `tests/nivel-celebracao.test.js` | três novos testes automáticos estáticos para fluxo, segurança da conta, acessibilidade e preservação dos contratos |
| `CONTINUIDADE.md` | este documento, novo na raiz do repositório; mantém histórico técnico anterior abaixo |

**Fluxo Solo/Coop:** o X após conclusão recarrega a página por `reloadClean()`. Como o aviso fica no armazenamento local por conta, reaparece na `home` após a conta ser consultada. **Desafio:** a saída encerra o duelo e volta à `home`, onde a celebração é liberada. Caso mais de um nível seja alcançado antes de mostrar o aviso, exibe o maior e informa a origem. Somente o servidor paga XP (`accounts.js`, `payMatch`); o cliente apenas mostra o evento `acc:ev` existente, sem criar eventos de socket nem rotas.

**Limitação conhecida:** o aviso pode ser recuperado após fechar/reabrir **se o evento de XP tiver chegado ao aparelho e sido salvo antes da interrupção**. Se o aparelho estava desligado/offline quando o evento foi emitido, o banco mantém o nível correto, mas **não existe no servidor um histórico de avisos pendentes** que permita recuperar essa animação posteriormente. Resolver esse caso de forma garantida requer trabalho posterior de persistência/consulta, não incluído nesta rodada. O nível e o XP não são afetados pela ausência do aviso.

**Testes realmente executados neste ambiente:**

- A cópia de base (`/home/claude/repo` → `/mnt/data/qc-main-test`) tinha árvore Git `d829470bc6a645de7f833daec988c33ffb1bfb93`, idêntica à árvore do commit da `main` verificada no GitHub. A implementação foi feita em cópia separada, sem tocar a base.
- `node --check public/game.js` e `node --check public/conta.js`: aprovados.
- `node --test tests/xp.test.js tests/desempenho.test.js tests/rotacao-visual.test.js tests/historico-som.test.js tests/nivel-celebracao.test.js`: **28 de 28 aprovados**.
- Navegador Chromium local com HTML/CSS/JS reais e APIs de conta e Socket.IO **simuladas**, sem servidor real: **19 verificações aprovadas**, incluindo evento de XP durante a partida, reabertura após reload (armazenamento simulado por origem), janela de resultado aberta, Desafio, troca de conta, botão, movimento reduzido, viewport 360×740 e 320×550, sem exceções JavaScript. Duas capturas de tela locais foram analisadas.
- **Não executados:** partida real com servidor Socket.IO, PostgreSQL, Neon, Render, bateria completa de `npm test` (faltam `socket.io-client` e outros pacotes de npm neste ambiente), desempenho em Android real, som/vibração no celular e atualização PWA instalada. A rodada só será considerada aprovada quando o proprietário testar no Android após Merge e deploy manual.

**Cuidados:** não alterar os hashes das funções de geometria SVG (`tests/desempenho.test.js`), `SNAP`/`tryLock` duplicados, migrações imutáveis 001–004, nomes de eventos de socket, `payMatch` e políticas infantis (frases prontas; não mostrar e-mail ou XP bruto de terceiros). Nenhuma alteração de servidor ou banco nesta rodada.

## B. Próxima rodada — GEMAS (APROVADA COMO PROPOSTA, NÃO IMPLEMENTADA)

**Só iniciar após o proprietário testar e aprovar a Rodada 1 no celular.** Não confundir proposta com código existente.

- Recompensas de gemas por partida concluída: **6 peças = 1; 12 = 2; 20 = 3; 30 = 5; 48 = 8**.
- Bônus por subir de nível: **níveis 2–9 = 10; 10–19 = 15; 20–29 = 20; 30–49 = 30; 50–100 = 50 gemas**.
- Na tela de resultado, mostrar gemas da partida; após voltar ao início, na celebração de nível, mostrar o bônus da subida **sem crédito duplicado**.
- Criar saldo persistente com histórico de crédito no PostgreSQL, vinculado à conta. O servidor autoriza e contabiliza, com idempotência por partida e por nível, inclusive para Solo, Cooperativo e Desafio (validar cada fluxo). O cliente **nunca** determina o saldo nem credita gemas diretamente.
- A versão inicial **NÃO TERÁ loja, compras de gemas, gastos, descontos ou vantagens desbloqueáveis**. Apenas obter e consultar gemas. Não há dinheiro real.
- O XP atual permanece integralmente regido por `payMatch`. A camada de gemas precisa acompanhar a confirmação da recompensa do servidor e testar simultaneidade e pagamentos repetidos.
- Migrações anteriores `001`–`004` são imutáveis; criar `005_...sql` (ou numeração posterior que estiver livre na `main` então) e atualizar `tests/migrations.sha256.json`.
- **Testes SQL em PostgreSQL isolado são necessários antes de publicar gemas**: não usar Neon de produção para testar cenários destrutivos, mesmo que o usuário não queira instalar nada. Procurar alternativa neste ambiente ou instância de testes isolada; se impossível, documentar impedimento e não publicar a economia sem testes de persistência.

## C. Publicação e rotina obrigatória

1. Conferir `CONTINUIDADE.md` e ler o commit **atual** da `main` pelo GitHub antes de cada rodada.
2. Comparar o conteúdo atual de todos os arquivos a editar para não sobrepor mudanças de terceiros.
3. Trabalhar apenas na ramificação nova criada pelo proprietário; jamais alterar a `main` diretamente. O assistente não tem permissão de publicar/deploy.
4. Entregar um `.zip` com somente os arquivos modificados e respectivos caminhos. O proprietário faz upload à **ramificação nova**, abre PR, revisa, faz Merge, faz deploy manual no Render e testa no Android.
5. Após ele confirmar a aprovação, iniciar a rodada seguinte.
6. Identificar sempre testes executados e não executados. A experiência no Android real só é confirmada pelo proprietário.

---

# DOCUMENTO HISTÓRICO PRESERVADO (28/10/2026)

O conteúdo a seguir foi fornecido pelo proprietário antes desta rodada. Ele descreve estados anteriores do projeto; **as informações do adendo A–C e a `main` atual prevalecem** quando houver diferença.

---

# Documento técnico de continuidade: Quebra-cabeça a dois

28/10/2026 · @Herbert · revisão que substitui as versões anteriores (a de 27/10/2026, commit `43e0bd5`, e a primeira de 28/10/2026). Base: commit `9c0471b`; inclui as confirmações de produção feitas em 28/10/2026 (seção 6)

Estado verificado do projeto na `main` (commit `9c0471b`, 28/10/2026, Pull Request #8): o que existe, o que não pode mudar, o que foi testado e o que falta. Tudo foi lido nos arquivos atuais do GitHub (`herbertttomes2028/QUEBRA-APK`, ramificação `main`). Onde não consegui verificar, está escrito **"a confirmar"**.

## 1. Arquitetura e arquivos principais

É um único serviço Node.js (Express + Socket.IO) que serve um front-end em JavaScript puro, sem framework nem etapa de build. As salas de partida vivem **na memória do servidor**; contas, amigos, XP e histórico ficam em **PostgreSQL**, opcional. Base desta leitura: commit `9c0471b` da `main` (28/10/2026). **Os arquivos do jogo são idênticos aos do commit `43e0bd5`** (27/10/2026, níveis e tela inicial limpa); desde então entraram só testes, `.gitignore`, o `render.yaml` corrigido e o `package.json`.

**Commits recentes da `main`**

| Commit | Data (horário de Brasília) | O que é |
| --- | --- | --- |
| `43e0bd5` | 27/10/2026 21:54 | Merge do PR #6 (tela inicial). Último merge que mudou arquivos do jogo |
| `479e2e6` | 28/10/2026 11:40 | Merge do PR #7 (`testes-e-higiene`): pasta `tests/`, script `test` e devDependency no `package.json`, e `render.yaml` sem a chave `envVars` duplicada. **Não trouxe o `.gitignore`** |
| `9c0471b` | 28/10/2026 11:51 | Merge do PR #8 (`gitignore`): só o `.gitignore` |

Desde `43e0bd5` foram **dois** Pull Requests novos (#7 e #8); o #6 já estava incluído em `43e0bd5`. Conferido: nenhum arquivo do jogo (`server.js`, `accounts.js`, `challenge.js`, `xp.js`, `security.js`, `phrases.js`, `mailer.js`, `db.js`, `public/*`, `migrations/*`, `scripts/*`) nem nenhum `.md` existente mudou nesse intervalo.

| Arquivo | Linhas | Papel |
| --- | --: | --- |
| `server.js` | 1.173 | Express, cabeçalhos de segurança, `/api/config`, upload de imagens, salas cooperativas em memória, eventos de socket do modo cooperativo, push, e a ligação com `challenge.js` e `accounts.js` |
| `challenge.js` | 637 | Sala Desafio (duelo), exportada como fábrica `createChallenge(d)`; recebe as dependências do servidor |
| `accounts.js` | 946 | Contas, login, amigos, convites, bloqueios, histórico, progresso salvo, perfil do amigo e pagamento de XP; rotas em `/api/acc/*` |
| `xp.js` | 70 | Fórmulas puras de nível e XP, sem acesso a banco |
| `security.js` | 115 | Cabeçalhos, CSP (relatar ou obrigar) e limite de tentativas de código de sala |
| `phrases.js` | 55 | Frases prontas do bate-papo e as regras de desbloqueio |
| `mailer.js` | 84 | Código por e-mail via API do Brevo (HTTPS, sem SMTP) |
| `db.js` e `scripts/migrate.js` | 73 e 9 | Conexão, TLS verificado e migrações automáticas na partida |
| `migrations/` | 3 arquivos | `001_contas`, `002_seguranca`, `003_xp`; só acrescentam |
| `public/game.js` | 3.290 | Todo o jogo no celular: tabuleiro, arrastar e encaixar, salas, bate-papo, resultado, níveis |
| `public/conta.js` | 851 | Perfil, amigos, convites, perfil do amigo, confirmação por e-mail |
| `public/index.html` e `style.css` | 689 e 2.011 | Todas as telas e janelas, e o tema claro, escuro e de texto grande |
| `public/sw.js` | 166 | Service worker: abre o app a partir do celular e atualiza por trás |
| `public/manifest.webmanifest`, `assetlinks.json`, `privacidade.html`, `boot.js` | pequenos | Instalação, verificação do APK, política de privacidade e tema no primeiro quadro |
| `tests/` | 8 arquivos | Suíte do repositório (`npm test`, 36 testes; seção 7.1): `helpers.js` (51 linhas), `run.js` (8), `xp.test.js` (91), `contratos.test.js` (178), `coop.test.js` (153), `desafio.test.js` (120), `migrations.sha256.json` (5) e `LEIA-ME.md` (34) |
| `package.json` e `package-lock.json` | 24 e 1.470 | Scripts `start`, `migrate` e `test`; 4 dependências do jogo (inalteradas) e 1 devDependency |
| `.gitignore` | 25 | Ignora `node_modules/`, `.env` e `.env.*` (menos `.env.example`), `*.pem`, `*.key`, `*.jks`, `*.keystore`, `signing-key-info.txt` (chave do APK), `*.log`, `npm-debug.log*`, `.DS_Store`, `Thumbs.db`, `.vscode/`, `.idea/` e `coverage/` |
| `render.yaml` | 22 | Blueprint opcional: um único `envVars` com 5 variáveis, todas `sync: false` (valores só no painel do Render) |

Total: **80 arquivos rastreados** (eram 71 em `43e0bd5`).

Para o restante do ambiente:

- **Execução:** Render no plano gratuito (o servidor dorme após inatividade) e Neon para o PostgreSQL. O `render.yaml` é opcional.
- **Deploy:** feito **manualmente**, por decisão sua (Manual Deploy no painel do Render depois de cada Merge). O deploy da `9c0471b` aparece como **Live**, com o gatilho "Manually deployed by you via Dashboard" (captura de tela que você enviou). Não consigo ver o painel do Render; se o deploy automático também está ligado não foi verificado, e você indicou que isso não importa.
- **Android:** o APK é um TWA gerado no PWABuilder e **não está no repositório**; só o `assetlinks.json` está.
- **Imagens:** 16 em `public/imagens` (mais o `nomes.json`, com os nomes de exibição) e 17 miniaturas em `public/imagens/mini`; uma delas é órfã ("Fundo para Combinar com Imagem.png", sem original; seção 6).
- **Documentação já no repositório:** `README.md`, `CONTAS.md`, `SEGURANCA.md`, `XP.md`, `PERFIL-AMIGO.md`, `ANDROID.md` e `tests/LEIA-ME.md`. O `README.md` e o `CONTAS.md` estão **parcialmente desatualizados** (seção 6); o que vale é este documento e o código.

## 2. Funcionalidades confirmadas no código

Tudo abaixo foi conferido nos arquivos da `main`, não em versões antigas da conversa. Os arquivos do jogo da `9c0471b` são idênticos aos de `43e0bd5`. Em 28/10/2026 reconferi no código atual, por amostragem, as constantes citadas nas seções 2 a 5 (giros máximos, `BOX_MAX`, tolerância de 45 s, `SNAP`, tamanho do código da sala, limite de envios, dicas, tabelas de XP, fuso de Fortaleza, modo padrão da CSP e as rotas de recuperação de senha); o restante vem da versão anterior deste documento, cujos arquivos de origem não mudaram. O que não está aqui não existe no código atual.

**Jogo**

- **Cooperativo:** uma pessoa cria a sala (código de 6 caracteres) e a outra entra pelo código ou por link `?sala=`. Cada jogador tem 10 dicas da imagem esmaecida (💡) e 5 pedidos de "onde esta peça encaixa" (📍). Cada peça aceita até 3 giros antes de "passar a vez".
- **Sala Desafio (duelo):** corrida entre dois jogadores, com sala de espera, contagem de 3 s, revanche, e volta de quem cai (tolerância de 45 s). Tem dois modos: **Comum** e **Quebrando Cabeças**, em que uma caixa libera 3 peças por rodada.
- **Tamanhos, imagens e bate-papo:** 5 tamanhos (6, 12, 20, 30 e 48 peças). A galeria tem 16 imagens, e há o envio de "Minha imagem" com recorte (JPEG validado no servidor, limite de 1,5 MB por imagem e 15 envios a cada 10 minutos). O bate-papo é **só de frases prontas**, sem texto livre: 10 básicas sempre liberadas, 14 liberadas conforme a pessoa joga e 7 reações com emoji (31 no total).

**Contas (exigem `DATABASE_URL`; sem ele o jogo funciona só como visitante)**

- Cadastro, login, Google opcional, código de confirmação por e-mail, recuperação e troca de senha, sair de todos os aparelhos, excluir conta.
- Amigos por código, convites para jogar, bloqueios, **perfil do amigo** (nível, 4 quadros e as conquistas), histórico de partidas, 10 conquistas, e **progresso salvo** com "Continuar jogando".
- **Níveis e XP** (seção 4). O nome e o avatar de quem tem conta ficam no perfil; a tela inicial **não tem mais** campo de nome nem avatares.

**Aplicativo**

- PWA com service worker que **abre a tela a partir do celular** mesmo com o servidor dormindo, e avisos push (VAPID) opcionais. O botão voltar do Android é tratado em um gerenciador central (um nível por toque; dois toques para sair na tela inicial).
- Ajustes de tamanho do texto, tema, movimento reduzido, sons e vibração; tutorial na primeira vez; confirmações dentro do app, sem janelas nativas.

**Segurança** (ver `SEGURANCA.md`): cabeçalhos em todas as respostas, CSP em modo relatar ou obrigar, bloqueio por tentativas de código de sala, certificado do banco verificado, e política de privacidade dentro do app.

**Não existe no código atual:** o filtro de bordas das peças. Ele foi adicionado em 27/10 (commits `8bd0668`, `e96f725` e `fd20cf7`) e removido por um envio às 10:57 do mesmo dia (`a921707`). Continua recuperável no histórico do Git (os quatro commits ainda existem: verificado em 28/10/2026).

## 3. Multiplayer e snap (encaixe das peças)

**O servidor é a autoridade**: ele decide quem segura cada peça, se ela encaixou e quando a partida termina. O celular só mostra e envia gestos. O encaixe tem **uma regra, escrita em dois lugares** (`tryLock` em `server.js` e `tryLock` em `challenge.js`), e as duas precisam continuar iguais.

**Regra de encaixe (idêntica nos dois modos)**

- A peça só trava se estiver **sem giro** (`rot === 0`) e a distância entre os centros da peça e do seu lugar for no máximo `SNAP = round(TILE × 0,33)`.
- Ao travar, o servidor põe a peça exatamente no lugar (`x`, `y`), marca `locked`, `lockedBy`, solta `heldBy`, e avisa com `locked` (ou o equivalente do desafio) mais os contadores.
- O celular **não decide** o encaixe: ao soltar, envia `drop` com `{ id, x, y }` e espera o `locked`. Girar a peça em cima do lugar certo também tenta encaixar (`rotate` chama `tryLock`).
- A vitória cooperativa é o servidor ver `lockedTotal === pieces.length`: então ele muda a sala para `won`, emite `won` e chama `accounts.finishCoop`.

**Cooperativo (`server.js`)**

- **Uma peça por jogador de cada vez:** `grab` recusa com `deny` (`locked` ou `held`) e solta a peça anterior de quem pega outra (`releaseHeldBy`).
- **Fluxo:** `grab` → `move` (volátil, no máximo \~40 por segundo, só quem segura a peça) → `drop` ou `rotate`. O outro jogador recebe `grabbed`, `moved`, `released`, `rotated` e `locked`.
- **Giros:** até `MAX_ROT = 3` por peça; ao estourar e soltar, os giros são renovados ("passar a vez").
- **Reentrada:** `join` com `pid` (identificador do aparelho) e `code`; o servidor responde com `snapshot` completo. A sala some após 15 min sem ninguém conectado ou 8 h de vida (varredura a cada 60 s).
- **Proteção do código de sala:** `joinLocked` e `joinMiss` limitam tentativas erradas; bloqueios entre jogadores respondem como "sala não encontrada".

**Sala Desafio (`challenge.js`, eventos com prefixo `ch:`)**

- Cada jogador monta a **mesma imagem no seu próprio tabuleiro** (`room.boards[idx]`); vence quem encaixar a última peça primeiro, e o servidor decide largada, tempo, progresso e vencedor.
- **Fases:** `lobby` → `countdown` (3 s) → `playing` → `finished`, com retorno ao `lobby` na revanche. `ch:drop`, `ch:rotate` e `ch:grab` só valem em `playing`.
- **Modo comum:** os dois recebem as peças nas mesmas posições e giros. **Quebrando Cabeças:** sem bandeja; `ch:gift` libera uma peça por toque, no máximo `BOX_MAX = 3` por rodada.
- **Queda de conexão:** 45 s (`GRACE_MS`) para voltar antes de perder por desistência.

**Conexão e persistência**

- As salas ficam **só na memória**: reiniciar ou dormir o servidor apaga as salas ativas. O que sobrevive é o progresso salvo de quem tem conta (cooperativo, via `accounts.noteCoop`, com pequeno atraso) e o histórico.
- No plano gratuito do Render o servidor dorme com inatividade. O `sw.js` abre a tela do app imediatamente e o `/api/config` volta a ser pedido quando o servidor acorda.

## 4. Sistema de níveis e XP

O XP é **calculado só no servidor**, guardado em `users.xp` e convertido em nível na hora de mostrar. Nenhuma rota recebe XP do celular, e o XP bruto só volta para o próprio dono (`/api/acc/me`); os outros jogadores veem apenas o nível. Todos os números ficam em `xp.js`; mudar um valor vale só para partidas futuras.

**Curva.** XP para ir do nível L ao L+1: `5 × round(10 × L^1,3)`, com nível máximo 100. O nível 2 pede 50 XP; o 10, 3.850; o 20, 20.155 (acumulados).

| Parte | Regra | Valor e limite |
| --- | --- | --- |
| Conclusão (1ª vez) | por faixa de peças (`BANDS`) | até 8: 20 · até 15: 45 · até 24: 80 · até 36: 130 · até 54: 220 · acima: 300 |
| Tempo mínimo | abaixo dele, nada é pago (`MIN_MS`) | 8 / 15 / 25 / 40 / 60 / 90 s, nas mesmas faixas |
| Repetição | por jogador e quebra-cabeça (`REP`) | 100%, 80%, 65%, 50%, 40%, 30% e, da 7ª em diante, 25%; **nunca zera** |
| Imagem própria | `CUSTOM_MULT` | 60%; todas as imagens próprias do mesmo tamanho contam como um só quebra-cabeça |
| Participação | jogar com outra pessoa por pelo menos o tempo mínimo | +10, até 10 por dia |
| Amigo | concluir com alguém da lista | +25% da conclusão, nas 4 primeiras do dia com a mesma pessoa |
| Vitória | vencer a Sala Desafio **e** concluir | +30% do XP base, nas 3 primeiras do dia contra a mesma pessoa |
| Conquistas | pagas uma única vez (`ACH_XP`) | `primeira` 25 · `dez` 40 · `vitoria` 40 · `campeao` 100 · `montador` 50 · `mestre` 100 · `veloz` 80 · `imagem` 25 · `amigo` 25 · `turma` 60 |

**Fluxo de pagamento (em `accounts.js`)**

1. `finishCoop(room)` e `finishDuel(...)` gravam o histórico e chamam `payMatch(uid, o)` para cada jogador com conta.
2. `payMatch` faz `ensureSeeded` (importa o histórico antigo uma única vez, em silêncio), depois `awardMatch`, depois `awardAchievements`.
3. `awardMatch` roda dentro de `tx()`, trava a linha do usuário (`SELECT … FOR UPDATE`) e se recusa a pagar de novo quando já existe uma linha em `xp_events` com a mesma `ref` (`c:<sala>:<início>` ou `d:<sala>:<rodada>:<início>`).
4. Os limites diários contam desde a meia-noite de **America/Fortaleza** (`DAY_START`). A mesma conta nos dois lados da sala não conta como outra pessoa.
5. O resultado atualiza o mapa em memória `levelMap` e vai ao celular pelo evento `acc:ev` com `t: 'xp'` (`gained`, `parts`, `ach`, `leveledUp`, `into`, `need`, `pct`...).

**Dados.** `users.xp` e `users.xp_seeded`; tabelas `xp_events` (cada pagamento, com `ref` única por usuário) e `puzzle_clears` (conclusões por quebra-cabeça). O XP guardado deve ser sempre igual à soma de `xp_events`.

**Na tela.** Selo `Nv N` colado ao nome (faixas de cor 1–9, 10–19, 20–29, 30–49 e 50+), barra no perfil, linha de ganho abaixo do tempo ao concluir, e animação de subir de nível de 2,4 s que não bloqueia toques. O nível dos outros aparece **no momento em que entram** na sala.

**Limite conhecido:** o aviso de XP que chega com o celular desligado ou offline não é reexibido; o total no servidor fica correto.

## 5. Funções e contratos que NÃO devem ser alterados

O app instalado e o service worker ficam em cache nos celulares e conversam com o servidor atual. Renomear qualquer item abaixo quebra versões antigas que ainda estão em uso. Se for preciso mudar, aceite os dois formatos por um período.

Parte destes contratos agora é vigiada por `npm test` (seção 7.1): migrações imutáveis (por hash), as duas cópias de `tryLock` e de `SNAP`, os nomes dos eventos de socket, `payMatch` como única entrada de XP, o retorno de `createAccounts`, sessão só por hash, frases só por código, a CSP e a tela inicial sem nome e avatares. Esses testes comparam o **texto** dos arquivos: se uma mudança legítima alterar esses trechos (por exemplo, unificar a regra de encaixe), os testes precisam ser atualizados na mesma rodada.

| Contrato | Onde | Por que não mudar |
| --- | --- | --- |
| Regra de encaixe: `rot === 0` e distância ≤ `SNAP = round(TILE × 0,33)` | `tryLock` em `server.js` e em `challenge.js` | Há duas cópias, e o próprio `SNAP` também é definido em dois lugares (`layoutFor` em `server.js` e `layoutQuebra` em `challenge.js`). Mudar só uma faz o desafio encaixar diferente do cooperativo |
| Eventos do cooperativo, cliente para servidor: `create`, `join`, `grab`, `move`, `drop`, `rotate`, `hint`, `spot`, `chat`, `restart`, `rematch:answer`, `rematch:cancel`, `acc:continue`, `imgready`, `push:subscribe`, `push:unsubscribe` | `server.js` | O cliente emite esses nomes e formatos; `join` leva `pid` e `code`, `drop` leva `{ id, x, y }` |
| Eventos do cooperativo, servidor para cliente: `state`, `meta`, `grabbed`, `moved`, `released`, `rotated`, `locked`, `deny`, `won`, `chat`, `rematch` | `server.js` | O cliente reage a cada nome; `locked` leva `counts` e `locked`, `won` leva `elapsedMs` |
| Eventos da Sala Desafio, todos com prefixo `ch:`. Do cliente: `ch:create`, `ch:join`, `ch:ready`, `ch:grab`, `ch:move`, `ch:drop`, `ch:rotate`, `ch:gift`, `ch:rematch`, `ch:leave`, `ch:chat`, `ch:hint`, `ch:spot`, `ch:imgready`, `ch:push:*`. Do servidor: `ch:progress`, `ch:end`, `ch:lobby`, `ch:countdown`, `ch:box`, `ch:cancel` | `challenge.js` | Módulo independente do cooperativo; o prefixo evita colisão |
| Eventos de contas: `acc:auth`, `acc:logout`, `acc:blockPeer`, `inv:send`, `inv:respond`, e o aviso `acc:ev` (inclui `t: 'xp'`) | `accounts.js` | O cliente de contas e o perfil dependem deles |
| Resposta de `/api/config`: `images`, `presets`, `defaultPieces`, `hints`, `spots`, `maxName`, `chat`, `codeLen`, `phrases`, `avatars`, `push`, `accounts`, `upload` | `server.js` | `fetchConfig` no cliente lê esses campos; sem `accounts.enabled` as contas somem da tela |
| Retorno de `createAccounts`: `enabled`, `config`, `noteCoop`, `flush`, `loadSave`, `deleteSave`, `finishCoop`, `finishDuel`, `levelOf`, `isOnline`, `expireInvites`, `allowedPhrases`, `blockedBetween`, `blockUser`, `verifyGoogleIdToken`, `close` | `accounts.js` | `server.js` chama cada um; os ganchos `accHooks.duelFinish` e `accHooks.levelOf` ligam o desafio às contas |
| `payMatch` como **única** entrada de XP, com `ref` única por pagamento; `matchReward`, `needFor` e `CUM` | `accounts.js`, `xp.js` | Mudar a curva muda o nível de todo mundo; pagar fora de `payMatch` fura a proteção contra XP duplicado |
| Migrações `001`, `002`, `003` imutáveis; novas mudanças entram como `004` em diante | `migrations/` | Já foram aplicadas no banco real; editar uma delas não roda de novo e deixa o banco diferente do código |
| Sessão: o token cru nunca é guardado, só `sha256(token)` em `sessions.token_hash` | `accounts.js` | Vazamento do banco não entrega sessões |
| Frases só por código (`phrases.byId`), sem texto livre; e-mail e id nunca vão a outros jogadores; perfil do amigo só para amigos | `phrases.js`, `accounts.js` | Proteção de crianças; é um requisito do projeto |
| CSP com `script-src 'self'` (+ Google), sem script embutido na página, e `frame-ancestors 'none'` sempre | `security.js`, `public/boot.js` | Por isso o tema inicial vive em `boot.js` externo; script embutido seria bloqueado no modo `enforce` |
| Chaves do aparelho `qc.*` (`avatar`, `best`, `name`, `pieces`, `settings`, `token`, `tutorial`) | `public/game.js`, `conta.js` | Renomear desloga as pessoas e apaga preferências e melhores tempos |
| Tela inicial **sem** `#input-name` nem `#avatar-grid`; `readName()` lê `state.name` e o servidor completa "Jogador 1/2" | `public/game.js`, `index.html` | Decisão do projeto: nome e avatar são do perfil |

## 6. Dependências, problemas conhecidos e pendências

**Dependências.** Node 18 ou superior; pacotes do jogo `express ^4.19.2`, `pg ^8.23.1`, `socket.io ^4.7.5` e `web-push ^3.6.7` (**inalterados** desde `43e0bd5`), mais a devDependency `socket.io-client ^4.8.4`, usada só pelos testes (há `package-lock.json`). Serviços externos e variáveis de ambiente (preenchidas no painel do Render, nunca no GitHub):

| Serviço ou variável | Para quê | Situação |
| --- | --- | --- |
| Render (plano gratuito) | Hospedagem; o servidor dorme com inatividade e acorda em até \~1 minuto (a consulta ao `/diagnostico` em 28/10/2026 levou 12,9 s com o servidor dormindo) | Em uso. **Deploy manual, por decisão sua**; o deploy da `9c0471b` está Live |
| Neon (PostgreSQL) via `DATABASE_URL` | Contas, amigos, XP, histórico, progresso salvo. Sem ela, só modo visitante | Em uso. Migrações 001, 002 e 003 **confirmadas em produção por você** (ver abaixo) |
| Brevo via `BREVO_API_KEY`, `BREVO_SENDER_EMAIL` e `BREVO_SENDER_NAME` | Código de confirmação e recuperação por e-mail | Em uso: `/diagnostico` mostra "configurado (brevo)", 0 enviados e 0 falhas (contador desde a última partida do servidor). **Entrega real do e-mail: não testada** (a confirmar por você) |
| `GOOGLE_CLIENT_ID` | Botão "Continuar com o Google" | Opcional. **Desligado em produção** (`login_google: false` em `/diagnostico`) |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Avisos push | Opcional |
| `CSP_MODE` (`report` padrão, `enforce`, `off`) | Política de conteúdo | **`report`** em produção (observado em `/diagnostico` em 28/10/2026, com 0 violações). O contador fica na memória do servidor e zera quando ele reinicia ou dorme, então esse zero ainda não é um dado confiável |
| `ASSETLINKS_JSON` | Verificação do APK sem mexer no GitHub | Opcional |
| `MAX_IMAGES`, `UPLOAD_RATE`, `CODE_LEN`, `CH_*`, `REMATCH_MS`, `INVITE_MS` e outras | Ajustes finos, todos com valor padrão | Opcional |

O `render.yaml` declara as 5 variáveis `DATABASE_URL`, `GOOGLE_CLIENT_ID`, `BREVO_API_KEY`, `BREVO_SENDER_EMAIL` e `BREVO_SENDER_NAME`, todas com `sync: false`. Se o Render instala a devDependency de teste no deploy é **a confirmar** (não afeta o jogo; no máximo alguns segundos a mais).

**Problemas conhecidos (verificados no código atual, `9c0471b`)**

- **A regra de encaixe está duplicada** em `server.js` e `challenge.js`, e a constante `SNAP = round(TILE × 0,33)` também é definida em dois lugares (`server.js` linha 133 e `challenge.js` linha 53). `npm test` vigia as duas cópias, mas de forma textual.
- **`style-src` da CSP inclui `'unsafe-inline'`**, porque o app usa estilos em linha; o `script-src` é estrito.
- **Salas vivem na memória:** reiniciar ou dormir o servidor encerra as partidas em andamento (só o progresso salvo de quem tem conta volta).
- **Miniatura órfã:** `public/imagens/mini/Fundo para Combinar com Imagem.png` (194 KB) não tem original em `public/imagens`; o original foi apagado em 27/10/2026 (commit `2536265`). **Nenhum código a usa**: o servidor só entrega a miniatura quando existe o original de mesmo nome, e a lista que a galeria recebe é idêntica com e sem o arquivo (verificado). Existe **uma menção textual** em `ANDROID.md` (linha 44, sobre o peso do original). **Decisão (28/10/2026): manter por enquanto**; resolver junto com a atualização do `ANDROID.md`, que ainda cita esse arquivo.
- **`public/game.js` tem 3.290 linhas** em um só arquivo.
- **Visitantes sem conta não escolhem nome nem avatar** (viram "Jogador 1" ou "Jogador 2"); é consequência da decisão de tirar esses campos da tela inicial.
- **XP:** o aviso perdido com o celular offline não é reexibido, e o nível dos outros só atualiza quando entram numa sala.
- **Documentação desatualizada:** o `README.md` ainda descreve código de sala de 4 caracteres, conversa com texto livre e nome e avatar na tela inicial; o `CONTAS.md` diz que recuperar senha por e-mail "não existe", mas as rotas existem em `accounts.js`.
- **`public/imagens/nomes.json`** cita 3 arquivos que não existem (`super-heroina.jpg`, `super-heroi.jpg`, `time-de-herois.jpg`). É inofensivo: a galeria mostra as 16 imagens existentes, todas com miniatura.
- **Imagem pesada:** `public/imagens/APARECIDA.png` tem 1,20 MB (o `ANDROID.md` recomendava reduzir para menos de 300 KB). Nenhuma outra original passa de 500 KB.
- **Contato de privacidade:** `public/privacidade.html` não tem mais o texto "[PREENCHER...]". O endereço de contato é `herbert.uva.unversidade@gmail.com`; a palavra "unversidade" pode ser erro de digitação (talvez "universidade"), mas pode ser o endereço real. **A confirmar por você**: os pedidos de exclusão de conta vão para esse endereço.
- **O pacote de testes de integração está fora do repositório** (seção 7.2): hoje existe como um `.zip` guardado por você. **Decisão (28/10/2026): fica fora do repositório, guardado por você** (opção A). Colocá-lo em `tests-integracao/` exigiria antes parametrizar os caminhos fixos.

**Pendências e decisões do projeto**

- **Rodada 2 (adiada por você):** novas conquistas, medalhas e títulos.
- **Rodadas planejadas e ainda não iniciadas:** 3, social (online agora, ranking entre amigos, reações); 4, regras (revanche melhor de 3, desafio diário); 5, conteúdo (categorias, temas, imagem da semana, com imagens enviadas por você).
- **Adiados:** plano pago do Render, domínio próprio, imagens mais leves e uma revisão de acessibilidade.
- **Fora do escopo por decisão sua:** níveis de dificuldade, mais de dois jogadores e modo turma.
- **Recuperável, se quiser:** o filtro de bordas (commits `8bd0668`, `e96f725`, `fd20cf7`).
- **Decisões suas pendentes:** (a) política de conteúdo: manter `CSP_MODE=report` até haver dados reais de uso e só então decidir por `enforce`; (b) o endereço de contato em `privacidade.html`; (c) o nome do visitante sem conta ("Jogador 1/2" ou nome local). **Decididas em 28/10/2026:** deploy manual; pacote de testes de integração fora do repositório; miniatura órfã mantida por enquanto.
- **Para confirmar por você:** (1) o teste real do envio de e-mail pelo Brevo (criar uma conta com um e-mail seu e ver se o código chega; se não chegar, o campo `ultimo_erro` de `/diagnostico` mostra o motivo); (2) o endereço de e-mail de contato de `privacidade.html`.
- **Confirmado em produção (informado por você; não tenho acesso ao Neon):** em 28/10/2026, 12:29, no Neon (SQL Editor, ramificação `production`, banco `neondb`), a tabela `schema_migrations` contém `001_contas.sql` (25/10, 19:46 UTC), `002_seguranca.sql` (26/10, 13:01 UTC) e `003_xp.sql` (27/10, 21:49 UTC). Portanto a migração `003_xp.sql` está aplicada e as tabelas e colunas de XP existem em produção.
- **Confirmado por consulta direta (28/10/2026):** o `/diagnostico` do app publicado respondeu 200 e mostrou: servidor ok; contas ativas e banco configurado; confirmação por e-mail ligada; e-mail "configurado (brevo)" com 0 enviados e 0 falhas; CSP em modo `report` com 0 violações; código de sala com 6 caracteres; 16 imagens; login com Google desligado; e o `assetlinks.json` publicado para o pacote `com.onrender.quebra_apk.twa`, com 1 impressão digital. Os contadores de e-mail e de CSP são da memória do servidor e zeram quando ele reinicia ou dorme.
- **Mudança planejada, ainda não iniciada: modo Solo ("Jogar") e um X na tela de conclusão.** Pedido do dono: (a) hoje o jogo só tem modo em dupla, sempre com código para parear; criar um modo Solo no lugar do botão "Criar partida", que passa a se chamar "Jogar"; (b) a Sala Desafio **não muda** (continua em dupla, com os modos Comum e Quebrando Cabeças); (c) no Solo a pessoa monta o próprio quebra-cabeça, sem código, sem progresso entre amigos, com progresso de conclusão da partida, sem bate-papo e sem o símbolo dos amigos; (d) o modo entre amigos (cooperativo) **permanece**: o Solo é um acréscimo, e não uma troca; (e) a janela da imagem completa que aparece depois de concluir, com o botão amarelo "Ver resultado", não tem X para fechar (hoje só o botão voltar do celular a fecha): acrescentar um X. **Decisões abertas, com sugestões ainda não aprovadas:** onde o cooperativo fica na tela inicial; se o Solo roda no servidor (reaproveitando a regra de encaixe) ou só no celular (o que criaria uma terceira cópia da regra); se o Solo conta para XP, histórico e conquistas; quais controles ficam (dicas, 📍, giro, cronômetro, sons e tutorial); e o comportamento exato do X. Entrega em dois pacotes: primeiro só o X, testado no celular; depois o Solo. "Continuar jogando" para o Solo fica fora da primeira versão.

## 7. Testes realmente executados e NÃO executados

Há **duas suítes**: a do repositório (`tests/`, rápida, sem banco) e o pacote de integração (fora do repositório, com PostgreSQL e Chromium). **Nenhum teste de nenhuma das duas rodou em celular Android real.**

### 7.1 Suíte do repositório: `npm test` (36 testes)

| Arquivo | Testes | O que cobre |
| --- | --: | --- |
| `xp.test.js` | 9 | Curva de níveis, XP por faixa de peças, repetição, imagem própria, tempo mínimo, bônus de amigo e de vitória, conquistas |
| `contratos.test.js` | 15 | Migrações 001–003 imutáveis (hash em `migrations.sha256.json`), as duas cópias de `tryLock` e de `SNAP`, nomes dos eventos de socket, `payMatch` como única entrada de XP, retorno de `createAccounts`, sessão só por hash, frases só por código, CSP sem script embutido, tela inicial sem nome e avatares, chaves `qc.*`, `package.json`, `render.yaml` (sem chave duplicada, 5 variáveis `sync: false`, sem valores) e `.gitignore` |
| `coop.test.js` | 7 | Servidor real (sem banco) com dois clientes: `/api/config`, sala de 2, encaixe (`rot === 0` e distância ≤ `SNAP`), girar em cima do lugar, exclusividade da peça, vitória cooperativa, bate-papo só com frases |
| `desafio.test.js` | 5 | Sala Desafio real: lobby e contagem, tabuleiros separados, vencedor, mesma regra de encaixe, caixa do Quebrando Cabeças (3 por rodada, 4ª bloqueada, 3 automáticas), sair dá a vitória ao outro |

**Executado:**

- Em 28/10/2026, num checkout limpo da `main` `9c0471b`: `npm install` e `npm test` deram **36 de 36** (cerca de 4 s, Node 22), e o `git status` ficou limpo (o `.gitignore` esconde `node_modules`).
- Antes do merge, numa cópia **idêntica byte a byte** à árvore da `9c0471b`: 20 execuções seguidas sem falha e **36 de 36 também no Node 18.20.8**. Além disso, 14 mutações deliberadas (quebrar o código ou o arquivo de propósito) foram todas detectadas, com o controle passando: 8 no código e nos contratos, feitas na versão de 33 testes que antecedeu o PR #7, e 6 no `render.yaml` e no `.gitignore`, feitas na cópia idêntica à `9c0471b`.

**Limitações:**

- Não usa banco, Chromium nem celular; não cobre contas, amigos, XP gravado, histórico, telas, botão voltar, PWA, service worker, áudio nem vibração.
- Os testes de contrato leem o **texto** dos arquivos; uma refatoração legítima (como unificar `tryLock`) exige atualizar os testes na mesma rodada (veja `tests/LEIA-ME.md`).
- O teste dinâmico do Desafio não prova sozinho o caso `rot ≠ 0`; essa regra do Desafio é protegida pelo teste textual das duas cópias de `tryLock`.
- Não foi executado no Windows.

### 7.2 Pacote de testes de integração (fora do repositório)

Cerca de 55 scripts e um executor (`rodar-regressao.sh`) organizados em grupos. Exige PostgreSQL 16 local (banco `qc_test`, usuário e senha `qc`, endereço fixo no código), Chromium (via `@sparticuz/chromium`) e Node. Na última versão entregue (28/10/2026), tem 176 arquivos e 9,2 MB em `.zip` (as contagens podem variar entre versões do pacote), e **vários scripts têm caminhos fixos `/home/claude/...`**: ele só roda onde o `preparar.sh` cria os atalhos nesses caminhos. **Os testes apagam a tabela `users`** do banco local de testes (`TRUNCATE users CASCADE`); nunca devem apontar para o Neon.

| Grupo | O que roda | Ambiente do autor (outro chat) | Segundo ambiente (28/10/2026) |
| --- | --- | --- | --- |
| `rapido` | `xp_unit` (29), `sw_unit` (9), `assetlinks_test` (11) | passou | **passou** (49 verificações) |
| `xp` | `xp_unit`, `xp_sim`, `shot15a`, `shot15b` | passou | **passou** (sobre a `43e0bd5`; mesmos arquivos do jogo da `9c0471b`) |
| `servidor` | `xp_sim`, `sec_sim`, `acc_sim`, `prof_sim`, `sim2`, `feat_sim` (40), `chat_sim`, `ch_sim`, `up_sim` | passou | **passou** (9 de 9, em cópia idêntica à `9c0471b`) |
| `antigo` | `upgrade_test`, `shot6`, `shot13a`, `wake` | passou | **passou** (4 de 4, em cópia idêntica à `9c0471b`, com 3 versões do histórico do Git e a `fixtures/final15`) |
| `contas` | contas e amigos no navegador | passou | **não executado** |
| `telas` | telas e fluxos no Chromium | passou | **não executado** |
| `visual` | comparação visual com a versão anterior | passou | **não executado** |

Observações:

- Os grupos `contas`, `telas` e `visual` só foram executados no ambiente do autor, contra a `43e0bd5`; **não foram reexecutados na `9c0471b`**. Como os arquivos do jogo são idênticos, o resultado esperado é o mesmo, mas isso é **a confirmar**.
- O grupo `antigo` precisa das versões antigas (`versoes-antigas.sh`, que exige um **clone do Git com histórico**; um ZIP baixado do GitHub não serve). Sem elas, os 4 testes saem **PULADO, e PULADO não conta como aprovado**.
- A abertura com servidor dormindo (`wake`) foi medida pelo autor em 18,3 s antes e 0,22 s depois; no segundo ambiente passou, mas o tempo não foi registrado.
- Os totais de verificações de `sec_sim` (104) e `xp_sim` (33) vêm da versão anterior deste documento; no segundo ambiente os scripts só imprimiram "passaram", sem recontagem.
- O pacote em si teve defeitos corrigidos pelo autor depois de uma rodada: um arquivo (`webpush_stub.js`) fora do lugar esperado e o `upgrade_test` sem a versão antiga de que depende.

### 7.3 O que NÃO foi executado (nenhuma das suítes)

- **Celular Android real**: APK instalado (TWA), botão voltar, vibração e áudio reais.
- **Produção**: o Render e o Neon reais, e o envio de e-mail pelo Brevo (só com um provedor simulado).
- **Avisos push** de ponta a ponta, o **login com Google**, e qualquer teste em **iOS ou Safari**.
- **Carga**: muitas salas ao mesmo tempo, redes lentas reais, ou dois celulares em redes diferentes.
- **Validação do `render.yaml` pela CLI do Render** (`render blueprints validate`): a CLI exige um workspace autenticado e não pôde ser usada; o arquivo foi validado só com um leitor de YAML estrito e com os testes do repositório.
- `shot9b` (a galeria com "Minha imagem"): oscilava antes das mudanças e não foi repetido. O `shot9c` (galeria sem internet) passou.
- Os grupos `contas`, `telas` e `visual` na `9c0471b` (veja 7.2).

**Risco de continuidade:** a suíte rápida agora vive no GitHub (`tests/`), mas o pacote de integração (cerca de 55 scripts) existe só como um `.zip` guardado por você e como cópias nos chats; os ambientes dos assistentes não persistem (o ambiente do autor já reiniciou uma vez durante o trabalho). Decisão de 28/10/2026: fica fora do repositório, guardado por você; mantenha uma cópia fora do Claude (por exemplo, no Drive ou no computador).

## 8. Próximas etapas recomendadas

A ordem abaixo prioriza o que protege o projeto antes do que o amplia. Já concluídos desde a versão anterior: versionar os testes rápidos (`tests/`, PR #7), criar o `.gitignore` (PR #8) e corrigir a chave `envVars` duplicada do `render.yaml` (PR #7). Confirmados em produção em 28/10/2026: a migração `003_xp.sql` no Neon e o `/diagnostico`.

1. **Confirmar o que depende de você:** o teste real do envio de e-mail pelo Brevo e o endereço de contato em `privacidade.html`. Já confirmados em 28/10/2026: a migração `003_xp.sql` no Neon, o `/diagnostico` e o deploy manual como decisão sua.
2. **Testar em celular Android real** o APK instalado: botão voltar, abertura com o servidor dormindo, partida entre dois aparelhos, nível e XP. É o maior buraco da seção 7.3.
3. **Pacote de testes de integração: decidido** (fora do repositório, guardado por você). Se um dia entrar no repositório, parametrizar antes os caminhos `/home/claude/...`.
4. **Miniatura órfã: mantida por enquanto** (decisão de 28/10/2026); resolver junto com a atualização do `ANDROID.md`, que ainda a cita.
5. **Próxima tarefa: pacote só de documentação, sem mexer no jogo.** Atualizar o `README.md`, o `CONTAS.md` e o `ANDROID.md`; corrigir o `nomes.json` (3 nomes de arquivos inexistentes); opcionalmente reduzir `APARECIDA.png`.
6. **Decidir a política de conteúdo:** se `/diagnostico` mostrar poucas violações registradas depois de alguns dias de uso real (o contador zera quando o servidor dorme; hoje está em `report` com 0 violações, o que ainda não tem valor estatístico), passar `CSP_MODE` de `report` para `enforce` no Render. O `style-src 'unsafe-inline'` só cai se os estilos em linha forem removidos do front.
7. **Unificar a regra de encaixe** (`tryLock` e `SNAP`) em um único módulo usado por `server.js` e `challenge.js`. A rede de testes existe agora (`npm test` e, com PostgreSQL, os testes `sim2` e `ch_sim` do pacote de integração). Na **mesma rodada**, atualizar `tests/contratos.test.js` (que compara o texto das duas cópias).
8. **Decidir o nome do visitante:** manter "Jogador 1/2" ou permitir um nome local no cadastro ou no perfil do visitante.
9. **Modo Solo ("Jogar") e X na tela de conclusão** (descrição e decisões abertas na seção 6): primeiro o pacote do X, testado no celular; depois o Solo. **Depois, retomar o plano de rodadas**, uma por vez e com aprovação entre elas: Rodada 2 (conquistas, medalhas e títulos, já com XP próprio em `ACH_XP`), depois 3 (social), 4 (regras) e 5 (conteúdo).
10. **Opcional, de baixo risco:** reexibir ao abrir o app o XP ganho com o celular offline (lendo `xp_events`) e, aos poucos, dividir o `game.js` em módulos, sempre com os testes versionados.

**Protocolo de trabalho para a próxima conversa**

- Comece lendo este documento e confirmando o commit atual da `main`; nunca parta de versões antigas da conversa. Um ZIP baixado do GitHub não traz `.git`: confirme pelo hash na página do repositório ou com `git clone` (o repositório é público).
- Cada rodada vira uma **ramificação nova**, com um pacote contendo **só** os arquivos que mudam e uma lista exata deles, com a pasta de cada um; nada vai direto para a `main`.
- Antes de montar o pacote, compare a `main` do GitHub com a base usada, para não sobrescrever alterações feitas por você.
- Rode `npm test` antes e depois da mudança, num checkout limpo. Mudou `server.js` ou `challenge.js`: rode também `sim2` e `ch_sim` do pacote de integração. Mudou `accounts.js` ou `xp.js`: rode também `xp_sim`, `acc_sim` e `sec_sim` (precisam de PostgreSQL local). Mudou o front: rode também os grupos `telas` e `visual`. Só o que de fato for executado entra no relatório.
- Ao subir arquivos pelo navegador do GitHub, confira a lista em **Files changed** do Pull Request. Arquivos que começam com ponto (como o `.gitignore`) ficaram de fora do envio do PR #7 e só entraram no #8.
- **Depois de cada Merge, faça o Manual Deploy no Render.** O deploy é manual por decisão do dono; sem esse clique, o app no ar continua na versão anterior. Para mudanças que trazem migração de banco (004 em diante), confira `schema_migrations` no Neon depois do deploy.
- Só se afirma o que foi executado, e **teste em Android real** só conta quando de fato for feito em um aparelho.
