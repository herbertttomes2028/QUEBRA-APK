# Níveis e XP

O XP (pontos de experiência) mede a evolução de cada jogador. Ele é **calculado só no servidor**, fica **guardado na conta** e define o **nível**, que aparece colado ao nome (`Nv 12 Nome`).
**Todos os números abaixo ficam em um único arquivo, o `xp.js`**, para você ajustá-los depois sem mexer no resto do jogo.

## 1. Fórmula de progressão
XP para ir do nível **L** ao nível **L+1**:

    5 × arredondar( 10 × L^1,3 )

O nível máximo é **100**. Os primeiros níveis são rápidos e a exigência cresce de forma suave:

| Nível | XP para subir ao próximo | XP total para chegar nele |
|---:|---:|---:|
| 1 | 50 | 0 |
| 2 | 125 | 50 |
| 3 | 210 | 175 |
| 4 | 305 | 385 |
| 5 | 405 | 690 |
| 6 | 515 | 1.095 |
| 7 | 625 | 1.610 |
| 8 | 745 | 2.235 |
| 9 | 870 | 2.980 |
| 10 | 1.000 | 3.850 |
| 12 | 1.265 | 5.980 |
| 15 | 1.690 | 10.195 |
| 20 | 2.455 | 20.155 |
| 25 | 3.285 | 34.065 |
| 30 | 4.160 | 52.220 |
| 40 | 6.050 | 102.195 |
| 50 | 8.085 | 171.730 |
| 75 | 13.695 | 439.745 |
| 99 | 19.645 | 835.880 |

Leitura prática: o **nível 2** sai com 2 ou 3 quebra-cabeças pequenos. O **nível 10** pede 3.850 XP. Como o número de quebra-cabeças inéditos é limitado (cerca de 16 imagens em 5 tamanhos), chegar lá depende também das repetições (que pagam menos), das partidas com amigos, das vitórias e das conquistas. Os níveis acima de 20 são de longo prazo.

## 2. XP por concluir um quebra-cabeça (tabela por quantidade de peças)
Valor da **primeira vez** que o jogador conclui aquele quebra-cabeça:

| Peças | Faixa | XP |
|---|---|---:|
| 6 | até 8 | 20 |
| 12 | 9 a 15 | 45 |
| 20 | 16 a 24 | 80 |
| 30 | 25 a 36 | 130 |
| 48 | 37 a 54 | 220 |
| 55 ou mais | 55+ | 300 |

Quebra-cabeças maiores pagam **mais do que proporcionalmente**: cada peça vale mais nos grandes (48 peças = 11 vezes o XP de 6 peças com 8 vezes as peças), o que estimula experimentar desafios maiores.

## 3. Redução por repetição
Vale para **cada jogador e cada quebra-cabeça** (imagem + quantidade de peças). Repetir um quebra-cabeça **nunca zera** a recompensa e **não afeta os outros**:

| Vez que você conclui o MESMO quebra-cabeça | 1ª | 2ª | 3ª | 4ª | 5ª | 6ª | 7ª em diante |
|---|---:|---:|---:|---:|---:|---:|---:|
| Fração do XP | 100% | 80% | 65% | 50% | 40% | 30% | 25% |

Exemplos (XP recebido na 1ª / 2ª / 3ª / 4ª / 7ª conclusão do mesmo quebra-cabeça):

| Quebra-cabeça | XP base | 1ª / 2ª / 3ª / 4ª / 7ª | Tempo mínimo |
|---|---:|---|---:|
| 6 peças | 20 | 20 / 16 / 13 / 10 / 5 | 8 s |
| 12 peças | 45 | 45 / 36 / 29 / 23 / 11 | 15 s |
| 20 peças | 80 | 80 / 64 / 52 / 40 / 20 | 25 s |
| 30 peças | 130 | 130 / 104 / 85 / 65 / 33 | 40 s |
| 48 peças | 220 | 220 / 176 / 143 / 110 / 55 | 60 s |

Regras de contagem:
- O **mesmo desenho em outro tamanho** é outro quebra-cabeça (começa do 100%).
- **Imagens próprias** pagam **60%** e todas as imagens próprias do mesmo tamanho contam como **um só** quebra-cabeça (enviar uma foto nova não burla a redução).

## 4. Partidas com outras pessoas
Somam-se ao XP da conclusão:

| Recompensa | Quando | Valor | Limite |
|---|---|---|---|
| **Participação** | terminar uma partida com outra pessoa (cooperativo ou desafio) | +10 | até 10 partidas por dia (máx. 100 XP) |
| **Amigo** | concluir com alguém que está na sua lista de amigos | +25% do XP da conclusão | nas 4 primeiras do dia com a mesma pessoa |
| **Vitória** | vencer a Sala Desafio **e** concluir o quebra-cabeça | +30% do XP base | nas 3 primeiras do dia contra a mesma pessoa |

Quem perde o desafio e não conclui ganha só a **participação**. Vencer porque o adversário saiu **não paga vitória** (é preciso concluir).

## 5. Conquistas que já existem (XP de uma única vez)
Primeira partida 25 · Dez partidas 40 · Primeira vitória 40 · Campeão 100 · Montador 50 · Mestre dos 48 100 · Veloz 80 · Minha imagem 25 · Primeiro amigo 25 · Turma 60.

## 6. Proteções contra ganho artificial
- **Só o servidor paga.** O celular nunca envia XP; não existe rota para isso.
- **Nunca paga duas vezes.** Cada pagamento tem uma chave única (sala + rodada) e acontece dentro de uma transação que trava a linha do jogador. Reconectar, recarregar a página ou repetir o evento não gera XP duplicado (testado até com 3 chamadas simultâneas).
- **Tempo mínimo.** Quebra-cabeça concluído mais rápido que o mínimo da tabela acima (partida "fantasma") não paga XP de partida.
- **Limites por dia** (horário de Fortaleza) para participação, bônus de amigo e vitória contra a mesma pessoa.
- **Mesma conta nos dois lados** da sala não conta como "outra pessoa" (não dá para jogar contra si mesmo).
- Repetição, imagens próprias e tamanhos são tratados como na seção 3.

## 7. Contas que já existem
Na primeira vez que o jogador entra depois da atualização, o **histórico antigo** vira XP (conclusões, com a mesma redução por repetição, e as conquistas que ele já tinha), **sem avisos** de "nova conquista". Participações, bônus de amigo e vitórias antigas **não** são contados (o histórico não guarda com quem foi, então não dá para aplicar os limites).

## 8. Onde aparece
- **Ao lado do nome:** lista de amigos e pedidos, perfil do amigo, perfil próprio, chip da tela inicial, sala de espera e resultado do desafio, tela de vitória e bate-papo. O selo muda de cor por faixa (1–9, 10–19, 20–29, 30–49 e 50+).
- **Perfil próprio:** barra com o XP atual e quanto falta para o próximo nível.
- **Ao concluir:** quanto XP foi ganho, de onde veio (conclusão, amigo, vitória, participação, conquista) e, se o quebra-cabeça é repetido, o percentual pago.
- **Subiu de nível:** animação curta (2,4 s) que **não bloqueia toques**; com "Movimento reduzido" ligado, vira um fade simples.
- O **nível dos outros jogadores** aparece na sala **no momento em que entram**; se alguém subir de nível no meio da partida, o selo dele atualiza na próxima vez que ele entrar numa sala.

## 9. Banco de dados (só acrescenta; nada existente é alterado)
Migração `migrations/003_xp.sql`: colunas `users.xp` e `users.xp_seeded`, e as tabelas `xp_events` (cada pagamento, com chave única) e `puzzle_clears` (quantas vezes cada jogador concluiu cada quebra-cabeça). O XP guardado em `users.xp` sempre é igual à soma de `xp_events`.

## 10. Como ajustar o equilíbrio
No `xp.js`: `needFor` (curva), `BANDS` (XP por peças), `MIN_MS` (tempos mínimos), `REP` (redução por repetição), `CUSTOM_MULT`, `PARTICIPATION*`, `FRIEND_*`, `WIN_*` e `ACH_XP`. Mudar um valor vale só para partidas **futuras**; o XP já ganho não é recalculado.
