# Perfil do amigo (Rodada 1)

## O que é
Ao tocar no **cartão de um amigo** (Amigos > lista), abre o perfil dele. O menu **⋯** continua com "Remover" e "Bloquear".

## O que o perfil mostra
- Avatar, nome com o **nível** (`Nv N`), se está online e desde quando joga (mês e ano). O XP bruto não é mostrado.
- **Código de amigo**, com os botões **Copiar** e **Compartilhar**. Qualquer amigo pode ver e repassar o código.
- Quatro quadros: **Partidas**, **Concluídos**, **Desafios jogados** e **Vitórias**.
- O perfil **não mostra** melhores tempos, últimas partidas, derrotas nem quantidade de amigos (e esses dados nem saem do servidor).
- As **10 conquistas** (as ganhas em cor; as demais apagadas, com a dica de como ganhar).
- Ações: **Convidar para jogar**, **Remover dos amigos** e **Bloquear**.

## Regras de privacidade
- Só **amigos** veem o perfil. Quem foi bloqueado (ou bloqueou) **não vê** o perfil do outro, e a amizade acaba no bloqueio.
- O **e-mail nunca aparece**, nem o identificador interno, nem partidas salvas, nem o **nome dos adversários**.
- "Código inexistente", "não é seu amigo", "pedido pendente" e "bloqueado" dão **exatamente a mesma resposta**: ninguém descobre quem existe.
- Limite de **60 consultas por minuto** por pessoa.
- Se a amizade acabar do outro lado enquanto o perfil está aberto, ele **fecha sozinho** com um aviso.

## O que mudou no sistema
- **Servidor:** uma rota nova, `GET /api/acc/friends/profile?code=...`. **Não há mudança no banco de dados** (nenhuma tabela ou coluna nova), então não há migração e o *Revert* do GitHub desfaz tudo sem deixar rastro.
- **Cliente:** janela nova `modal-fprofile`, que reaproveita os quadros e as conquistas da tela "Meu perfil".

## Como testar no celular (dois aparelhos, duas contas amigas)
1. Na conta A: Amigos > toque no cartão do amigo B. O perfil abre com nome, código, quadros e conquistas.
2. Confira que **não há e-mail** em lugar nenhum.
3. **Copiar** e **Compartilhar** o código (cole numa conversa para ver o texto).
4. **Convidar para jogar** abre as opções por cima do perfil; cancelar volta ao perfil.
5. Em B, abra o perfil de A. Em A, **Remover dos amigos**: o perfil de A fecha na tela de B, com aviso.
6. Adicione de novo e use **Bloquear** pelo perfil: nenhum dos dois abre o perfil do outro.
7. No app instalado, o **botão voltar** do Android fecha o perfil.
