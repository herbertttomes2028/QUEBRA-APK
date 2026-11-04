# Conquistas e coleções

Este arquivo é **gerado** a partir de `achievements.js` (`node scripts/gerar-doc-conquistas.js`). Um teste confere que ele continua igual ao jogo.

## Como funciona

- **Calculadas, não digitadas:** o servidor calcula cada conquista a partir do histórico (partidas, imagens concluídas, amigos, nível). O celular nunca diz "ganhei".
- **Permanentes:** o pagamento do XP grava `ach:<id>` em `xp_events`. Quem ganhou **continua com a conquista** mesmo que o número mude depois (remover um amigo, o catálogo de imagens crescer...).
- **XP só pelo caminho de sempre:** as conquistas pagam XP dentro da mesma transação do XP da partida (`awardAchievements`, em `accounts.js`), **uma vez cada**, em até 6 passadas (o XP de uma pode liberar a seguinte, como as de nível).
- **Retroativas:** quem já cumpre uma conquista nova recebe o XP dela na próxima partida (com um aviso resumido). O XP vira nível e o nível dá gemas, então os valores abaixo são pequenos de propósito.

### XP por nível

| Nível | XP |
|---|---:|
| 🥉 Bronze | 5 |
| 🥈 Prata | 15 |
| 🥇 Ouro | 40 |
| 💎 Diamante | 100 |

As 10 conquistas que já existiam **mantêm o XP de antes** (25, 40, 40, 100, 50, 100, 80, 25, 25 e 60).

### Privacidade (crianças)

O perfil de **amigo** recebe **só as conquistas "Público"**, e só "ganhou ou não": nunca progresso, tempos, XP, número de amigos, dias ou horários de jogo, nem segredos. Velocidade, amizade, constância e segredos são **"Só você"**.

**Total de XP das conquistas fixas:** 3.345. As conquistas por categoria somam até 160 XP **por categoria** (as 4 de cada uma).

## 🌱 Primeiros passos

_Quanto mais você joga, mais cresce_

| | Conquista | Como ganhar | Nível | XP | Quem vê |
|---|---|---|---|---:|---|
| 🌟 | **Primeira partida** | Jogue sua primeira partida | 🥉 Bronze | 25 | Público |
| 🎯 | **Missão cumprida** | Conclua seu primeiro quebra-cabeça | 🥉 Bronze | 5 | Público |
| 🔟 | **Dez partidas** | Jogue 10 partidas | 🥈 Prata | 40 | Público |
| 🧩 | **Montador** | Conclua 5 quebra-cabeças | 🥈 Prata | 50 | Público |
| 🙌 | **Mãos de ouro** | Conclua 15 quebra-cabeças | 🥈 Prata | 15 | Público |
| 🔁 | **Já virou hábito** | Jogue 30 partidas | 🥈 Prata | 15 | Público |
| 🏃 | **Maratona de peças** | Conclua 40 quebra-cabeças | 🥇 Ouro | 40 | Público |
| 💙 | **Fã de carteirinha** | Jogue 75 partidas | 🥇 Ouro | 40 | Público |
| 🏛️ | **Lenda do quebra-cabeça** | Conclua 100 quebra-cabeças | 💎 Diamante | 100 | Público |
| 🏡 | **Craque da casa** | Jogue 150 partidas | 💎 Diamante | 100 | Público |

## 📏 Mestre dos tamanhos

_De 6 a 48 peças_

| | Conquista | Como ganhar | Nível | XP | Quem vê |
|---|---|---|---|---:|---|
| 🔥 | **Aquecimento** | Conclua 5 quebra-cabeças de 6 peças | 🥉 Bronze | 5 | Público |
| 🐜 | **Pequeno gigante** | Conclua 25 quebra-cabeças de 6 peças | 🥈 Prata | 15 | Público |
| 🥾 | **Trilha fácil** | Conclua 5 quebra-cabeças de 12 peças | 🥉 Bronze | 5 | Público |
| 👣 | **Passo firme** | Conclua 25 quebra-cabeças de 12 peças | 🥈 Prata | 15 | Público |
| ⛰️ | **Meio da subida** | Conclua 5 quebra-cabeças de 20 peças | 🥉 Bronze | 5 | Público |
| 🧗 | **Escalador** | Conclua 25 quebra-cabeças de 20 peças | 🥈 Prata | 15 | Público |
| 🥊 | **Desafio aceito** | Conclua 5 quebra-cabeças de 30 peças | 🥈 Prata | 15 | Público |
| 🦾 | **Dedos de aço** | Conclua 25 quebra-cabeças de 30 peças | 🥇 Ouro | 40 | Público |
| 🧠 | **Mestre dos 48** | Conclua um quebra-cabeça de 48 peças | 🥇 Ouro | 100 | Público |
| 🦣 | **Gigante das 48** | Conclua 5 quebra-cabeças de 48 peças | 🥇 Ouro | 40 | Público |
| 🗿 | **Titã dos 48** | Conclua 15 quebra-cabeças de 48 peças | 💎 Diamante | 100 | Público |
| 🌈 | **Todos os tamanhos** | Conclua pelo menos um de cada tamanho: 6, 12, 20, 30 e 48 peças | 🥇 Ouro | 40 | Público |

## ⚡ Velocidade

_Só você vê estas_

| | Conquista | Como ganhar | Nível | XP | Quem vê |
|---|---|---|---|---:|---|
| ⚡ | **Veloz** | Conclua 20+ peças em menos de 5 minutos | 🥇 Ouro | 80 | Público |
| 👁️ | **Piscou, montou** | Conclua 6 peças em menos de 45 segundos | 🥉 Bronze | 5 | Só você |
| 🌩️ | **Raio** | Conclua 6 peças em menos de 20 segundos | 🥈 Prata | 15 | Só você |
| 🐇 | **Ligeirinho** | Conclua 12 peças em menos de 1 min 30 s | 🥉 Bronze | 5 | Só você |
| 🚀 | **Foguete** | Conclua 12 peças em menos de 45 segundos | 🥈 Prata | 15 | Só você |
| 🏎️ | **Turbo** | Conclua 20 peças em menos de 3 minutos | 🥈 Prata | 15 | Só você |
| ✈️ | **Supersônico** | Conclua 20 peças em menos de 1 min 30 s | 🥇 Ouro | 40 | Só você |
| 🌪️ | **Vento forte** | Conclua 30 peças em menos de 5 minutos | 🥈 Prata | 15 | Só você |
| 🌀 | **Tufão** | Conclua 30 peças em menos de 3 minutos | 🥇 Ouro | 40 | Só você |
| 🥁 | **Ritmo de campeão** | Conclua 48 peças em menos de 8 minutos | 🥈 Prata | 15 | Só você |
| ⚔️ | **Relâmpago dos 48** | Conclua 48 peças em menos de 5 minutos | 💎 Diamante | 100 | Só você |

## 🏆 Desafio e equipe

_Vitórias, duplas e foco_

| | Conquista | Como ganhar | Nível | XP | Quem vê |
|---|---|---|---|---:|---|
| 🏆 | **Primeira vitória** | Vença uma Sala Desafio | 🥈 Prata | 40 | Público |
| 🤺 | **Aprendiz de duelista** | Jogue 5 partidas da Sala Desafio | 🥉 Bronze | 5 | Público |
| 🎧 | **Foco total** | Jogue 10 partidas no modo Solo | 🥉 Bronze | 5 | Público |
| 👯 | **Dupla perfeita** | Conclua 5 quebra-cabeças em dupla | 🥉 Bronze | 5 | Público |
| 🔥 | **Em chamas** | Vença 3 desafios seguidos | 🥈 Prata | 15 | Público |
| 🏟️ | **Veterano da arena** | Jogue 25 partidas da Sala Desafio | 🥈 Prata | 15 | Público |
| 🧘 | **Mente tranquila** | Jogue 50 partidas no modo Solo | 🥈 Prata | 15 | Público |
| 👑 | **Campeão** | Vença 10 desafios | 🥇 Ouro | 100 | Público |
| 🦁 | **Invencível** | Vença 5 desafios seguidos | 🥇 Ouro | 40 | Público |
| 🌠 | **Equipe dos sonhos** | Conclua 20 quebra-cabeças em dupla | 🥇 Ouro | 40 | Público |
| 🛡️ | **Imbatível** | Vença 25 desafios | 🥇 Ouro | 40 | Público |
| 🐉 | **Lenda do Desafio** | Vença 50 desafios | 💎 Diamante | 100 | Público |

## 🤝 Amizade

_Só você vê estas_

| | Conquista | Como ganhar | Nível | XP | Quem vê |
|---|---|---|---|---:|---|
| 🤝 | **Primeiro amigo** | Adicione um amigo | 🥉 Bronze | 25 | Só você |
| 💌 | **Convite aceito** | Convide um amigo e ele aceite jogar | 🥉 Bronze | 5 | Só você |
| 🫶 | **Parceria** | Conclua 5 partidas junto com amigos | 🥉 Bronze | 5 | Só você |
| 🎉 | **Turma** | Tenha 5 amigos | 🥈 Prata | 60 | Só você |
| 🏠 | **Anfitrião** | Tenha 5 convites aceitos | 🥈 Prata | 15 | Só você |
| 🎶 | **Dupla afinada** | Conclua 25 partidas junto com amigos | 🥈 Prata | 15 | Só você |
| 🌍 | **Mundo de amigos** | Jogue com 3 amigos diferentes | 🥈 Prata | 15 | Só você |
| 🎪 | **Turma grande** | Tenha 10 amigos | 🥇 Ouro | 40 | Só você |
| 🧵 | **Inseparáveis** | Conclua 100 partidas junto com amigos | 🥇 Ouro | 40 | Só você |
| 🎖️ | **Embaixador** | Jogue com 8 amigos diferentes | 🥇 Ouro | 40 | Só você |

## 📅 Constância

_Só você vê estas_

| | Conquista | Como ganhar | Nível | XP | Quem vê |
|---|---|---|---|---:|---|
| 👋 | **Voltou!** | Jogue em 3 dias diferentes | 🥉 Bronze | 5 | Só você |
| 🔗 | **Sequência** | Jogue 3 dias seguidos | 🥉 Bronze | 5 | Só você |
| ☀️ | **Dia cheio** | Jogue 5 partidas no mesmo dia | 🥉 Bronze | 5 | Só você |
| ⏱️ | **Primeira hora** | Some 1 hora de jogo | 🥉 Bronze | 5 | Só você |
| 🗓️ | **Semana de jogo** | Jogue em 7 dias diferentes | 🥈 Prata | 15 | Só você |
| 🌟 | **Semana perfeita** | Jogue 7 dias seguidos | 🥈 Prata | 15 | Só você |
| 🌋 | **Dia de maratona** | Jogue 10 partidas no mesmo dia | 🥈 Prata | 15 | Só você |
| ⌛ | **Tempo bem gasto** | Some 5 horas de jogo | 🥈 Prata | 15 | Só você |
| 📆 | **Mês inteiro** | Jogue em 30 dias diferentes | 🥇 Ouro | 40 | Só você |
| 🥇 | **Quinzena de ouro** | Jogue 14 dias seguidos | 🥇 Ouro | 40 | Só você |
| 🕰️ | **Horas de diversão** | Some 20 horas de jogo | 🥇 Ouro | 40 | Só você |
| 🏅 | **Cem dias** | Jogue em 100 dias diferentes | 💎 Diamante | 100 | Só você |
| 💎 | **Mês sem falhar** | Jogue 30 dias seguidos | 💎 Diamante | 100 | Só você |

## 🖼️ Coleção geral

_Sua galeria de imagens_

| | Conquista | Como ganhar | Nível | XP | Quem vê |
|---|---|---|---|---:|---|
| 🖼️ | **Primeiro quadro** | Conclua uma imagem das coleções | 🥉 Bronze | 5 | Público |
| 🔭 | **Curioso** | Conclua imagens de 3 coleções diferentes | 🥉 Bronze | 5 | Público |
| 🗝️ | **Chave de ouro** | Desbloqueie uma coleção com gemas | 🥉 Bronze | 5 | Público |
| 🏛️ | **Mini galeria** | Conclua 10 imagens das coleções | 🥈 Prata | 15 | Público |
| 🎨 | **Galeria completa** | Conclua 25 imagens das coleções | 🥈 Prata | 15 | Público |
| 🏁 | **Categoria concluída** | Conclua todas as imagens de uma coleção | 🥈 Prata | 15 | Público |
| 🔄 | **Quero de novo!** | Conclua o mesmo quebra-cabeça 5 vezes | 🥈 Prata | 15 | Público |
| 🧩 | **Mil peças** | Monte 1.000 peças no total | 🥈 Prata | 15 | Público |
| 🌐 | **Viajante dos mundos** | Conclua imagens de todas as coleções | 🥈 Prata | 15 | Público |
| 🏺 | **Museu pessoal** | Conclua 50 imagens das coleções | 🥇 Ouro | 40 | Público |
| 👑 | **Tripla coroa** | Conclua todas as imagens de 3 coleções | 🥇 Ouro | 40 | Público |
| 🧱 | **Cinco mil peças** | Monte 5.000 peças no total | 🥇 Ouro | 40 | Público |
| 🏰 | **Dono do acervo** | Desbloqueie todas as coleções com gemas | 🥈 Prata | 15 | Público |
| 🧑‍🎨 | **Curador-chefe** | Conclua 100 imagens das coleções | 💎 Diamante | 100 | Público |
| 🌌 | **Colecionador supremo** | Conclua todas as imagens de todas as coleções | 💎 Diamante | 100 | Público |

## ⭐ Evolução

_Níveis e caça às conquistas_

| | Conquista | Como ganhar | Nível | XP | Quem vê |
|---|---|---|---|---:|---|
| 🔰 | **Aprendiz** | Chegue ao nível 3 | 🥉 Bronze | 5 | Público |
| 🧭 | **Explorador** | Chegue ao nível 5 | 🥉 Bronze | 5 | Público |
| 🔎 | **Caçador de conquistas** | Ganhe 10 conquistas | 🥉 Bronze | 5 | Público |
| 🗡️ | **Aventureiro** | Chegue ao nível 8 | 🥈 Prata | 15 | Público |
| 🎯 | **Veterano** | Chegue ao nível 10 | 🥈 Prata | 15 | Público |
| 🎖️ | **Colecionador de medalhas** | Ganhe 25 conquistas | 🥈 Prata | 15 | Público |
| 🔮 | **Mestre** | Chegue ao nível 15 | 🥇 Ouro | 40 | Público |
| 🏵️ | **Campeão de verdade** | Chegue ao nível 20 | 🥇 Ouro | 40 | Público |
| 🌟 | **Lenda** | Chegue ao nível 30 | 🥇 Ouro | 40 | Público |
| 🏆 | **Mestre das conquistas** | Ganhe 50 conquistas | 🥇 Ouro | 40 | Público |
| 🦸 | **Herói** | Chegue ao nível 40 | 💎 Diamante | 100 | Público |
| 👸 | **Imortal** | Chegue ao nível 50 | 💎 Diamante | 100 | Público |
| 🪐 | **Completista** | Ganhe todas as conquistas visíveis | 💎 Diamante | 100 | Público |

## 🤫 Segredos

_Descubra jogando_

| | Conquista | Como ganhar | Nível | XP | Quem vê |
|---|---|---|---|---:|---|
| 🐢 | **Sem pressa** | Capricho vale mais que pressa: leve mais de 10 minutos num quebra-cabeça de 6 peças | 🥉 Bronze | 5 | Segredo (só você) |
| 🔁 | **Teimosia boa** | Conclua o mesmo quebra-cabeça 10 vezes | 🥈 Prata | 15 | Segredo (só você) |
| 🌎 | **Um mundo num dia** | Conclua imagens de 3 coleções diferentes no mesmo dia | 🥈 Prata | 15 | Segredo (só você) |
| 🔮 | **Lenda viva** | Nível 20, 100 quebra-cabeças concluídos e 10 vitórias | 💎 Diamante | 100 | Segredo (só você) |

## 🗂️ Por categoria

_Nascem sozinhas do catálogo de imagens: uma categoria nova ganha as dela._

Para cada categoria com `N` imagens (e `gate` = quantas liberam a seguinte):

| Id | Como ganhar | Nível | Quando existe |
|---|---|---|---|
| `cat_<id>_1` | Concluir a 1ª imagem | 🥉 Bronze | sempre |
| `cat_<id>_g` | Concluir as `gate` primeiras | 🥈 Prata | se `1 < gate < N` |
| `cat_<id>_h` | Concluir metade (`⌈N/2⌉`) | 🥇 Ouro | se `N ≥ 6` e a metade fica entre o `gate` e `N` |
| `cat_<id>_all` | Concluir todas as `N` | 💎 Diamante (🥇 se `N < 10`) | se `N ≥ 2` |

Títulos das categorias que existem hoje:

| Categoria | 1ª imagem | Explorador | Metade | Todas |
|---|---|---|---|---|
| `fauna` | Primeiro safári | Explorador da Fauna | Guardião da mata | Mestre da Fauna |
| `biomas` | Primeira trilha | Explorador dos biomas | Guardião das paisagens | Mestre dos Biomas |
| `espaco` | Decolagem | Astronauta | Navegador estelar | Mestre do Cosmos |
| `cultura` | Primeira pincelada | Amigo da arte | Curador | Mestre da Cultura |
| `fantasia` | Era uma vez… | Aprendiz de mago | Contador de histórias | Mestre da Fantasia |

Uma categoria que não está na tabela usa títulos genéricos ("Primeiro passo: …", "Explorador: …").

## Aposentada

- **Minha imagem** (`imagem`): o envio de fotos próprias foi removido. Quem já ganhou continua com ela; para os outros ela não aparece.
