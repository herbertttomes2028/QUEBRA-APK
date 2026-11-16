# Testes automáticos

A maior parte dos testes roda o **servidor de verdade** (`server.js`, sem banco, modo visitante) e clientes Socket.IO, mais verificações dos contratos do projeto no próprio código. Uma parte usa **PostgreSQL** (perfis, sessões, gemas, loja, segurança dinâmica): sem banco, esses são **pulados** (aparecem como `skipped`), não reprovados.

## Como rodar (no computador, com Node 18 ou superior)

    npm ci
    npm test

Sem banco: cerca de 30 a 40 segundos, termina com `# fail 0` e `# skipped 13` (os que precisam de PostgreSQL).

### Com banco (como o GitHub Actions faz)

Use **só um PostgreSQL local e descartável**, nunca o Neon. Os testes com banco **se recusam a rodar** se o endereço não for um banco chamado `qc_test` em `localhost`/`127.0.0.1` (é uma trava de proteção: não é defeito do jogo).

    DATABASE_URL=postgresql://qc:qc@127.0.0.1:5432/qc_test GEMAS_TEST_DB=1 npm run migrate
    DATABASE_URL=postgresql://qc:qc@127.0.0.1:5432/qc_test GEMAS_TEST_DB=1 npm test

Leva cerca de 45 a 60 segundos e termina com `# fail 0` e `# skipped 0`.

## O que cobre (principais)

| Arquivo | O que verifica |
| --- | --- |
| `contratos.test.js` | Migrações imutáveis (hash em `migrations.sha256.json`), as duas cópias de `tryLock` iguais, `SNAP`, nomes dos eventos de socket, `payMatch` como única entrada de XP, sessão só com hash, nenhum bate-papo, CSP, `render.yaml` (`npm ci`, sem chave duplicada, sem valores) e `.gitignore` |
| `coop.test.js`, `solo.test.js`, `desafio.test.js` | Partidas reais: cooperativo, Solo (ninguém entra pelo código), Sala Desafio |
| `sair-continuar.test.js` | **Com banco.** Cooperativo: sair pelo botão (evento `leave` ou disconnect de propósito) apaga o "Continuar jogando" daquela partida e ele não volta; cair/fechar o app mantém; sair de sala nova não apaga o de outra partida; retomar e sair apaga |
| `suavidade-leitura.test.js` | **Fluidez:** a partida só é montada quando a carta da abertura termina a volta (e cancelar/movimento reduzido/segundo plano não travam); o mascote para atrás das janelas; o "Como jogar" anima só transform/opacity; "Jogar com amigos" quebra a linha em A++ |
| `sem-bate-papo.test.js` | **Não existe bate-papo** (nem com `CHAT_ENABLED=true`): configuração, salas e Desafio sem conversa, `phrases.js` apagado, sem aviso de frase nova; janelas abertas dos Ajustes ficam por cima; Loja e Ajustes maiores |
| `fileira-cinco.test.js` | **Fileira de 5** (20, 30 e 48 peças): 5 à vista na largada, peça guardada não se pega, a nova aparece na vaga livre, até 3 soltas, teto de 8, partida inteira; cooperativo, Desafio Comum (mesma ordem para os dois), celular antigo sem fileira; 6/12 peças e Quebrando Cabeças sem mudança |
| `seguranca-perfil.test.js` | **Com banco.** Perfil gerado: código-chave, força bruta, sessões, no máximo 5 aparelhos (3b), acesso a dados de outro perfil com dados reais de B (5), gemas e XP forjados, salas, privacidade da sala e lista de bloqueados (7b), mapa de limites cheio (9c), denúncia que não revela IDs |
| `privacidade-sala.test.js` | Nível sempre 0 na sala; lista de bloqueados sem ID, apelido, nível nem avatar |
| `arrasto-sem-perda.test.js` | O arrasto não é descartado com a conexão ocupada (o amigo em polling atrás de rede lenta recebe todas as posições); a peça do amigo desliza ao encaixar |
| `limites-disponibilidade.test.js` | Limites por grupo (nenhum grupo cheio barra quem chega); toda rota com scrypt no limite de operações caras |
| `vaga-reservada.test.js` | Quem cai mantém a vaga; quem sai pelo botão Sair fecha a sala para novos; quem ficou termina sozinho |
| `endurecimento.test.js` | Avisos desligados sem a variável (o bate-papo nem existe mais); teto de 5 aparelhos e limpeza de sessões; ordem da conferência na denúncia; `.gitignore` do Android |
| `sem-html-injetado.test.js`, `trusted-types-relatorio.test.js` | Nenhum HTML montado com dados (inclui `innerHTML +=`, colchetes, `srcdoc`, `javascript:`…); política Trusted Types estreita; política de privacidade dentro do app pela política `qc` |
| `sem-segredos.test.js`, `seguranca-repositorio.test.js` | Nenhum segredo, chave, APK/AAB ou arquivo de nuvem no repositório |
| `xp.test.js`, `gemas*.test.js`, `loja*.test.js` | Curva de níveis, gemas, loja (compras simultâneas cobram uma vez só) |

## O que NÃO cobre

- Celular real (Android/APK), Render, Neon e Brevo **reais**.
- Telas no navegador (exceto as verificações de código) e o Trusted Types num navegador de verdade (foi medido à parte, num Chrome sem tela, em 15/11/2026).
- Carga (muitas salas ao mesmo tempo).

## Se uma migração precisar mudar

Nunca edite uma migração que já existe. Crie a próxima (`019_...sql`) e, **depois**, acrescente o hash dela em `migrations.sha256.json` (`sha256sum migrations/019_*.sql`). O teste exige que toda migração esteja travada. Toda alteração no banco de produção entra como migração; no SQL Editor do Neon use só consultas de leitura.

## Se você mudar a regra de encaixe de propósito

Mude `tryLock` nos **dois** arquivos (`server.js` e `challenge.js`) e atualize os testes `contratos` e `coop`/`desafio` na mesma rodada.
