# Quebra-Cabeça a Dois — ficha da Play Store e respostas dos formulários

Atualizado em 09/11/2026; **partes sobre conta, amigos e dados coletados revisadas em 14/11/2026 (perfil gerado)**. Mesmo conteúdo do documento "Quebra-Cabeça a Dois — ficha da Play Store e respostas dos formulários" (Claude Docs do proprietário). Aqui não há segredos: a chave de envio e a senha ficam só com o proprietário, fora do GitHub.

## 1. Ficha da loja

Copie cada texto para o campo de mesmo nome em **Play Console › Presença na loja › Versão principal da página**. Todos respeitam os limites de caracteres da loja e nenhum apresenta o jogo como infantil.

| Campo | O que colocar | Limite |
| --- | --- | --- |
| Nome do app | Quebra-Cabeça a Dois | 30 (usa 20) |
| Descrição curta | Monte quebra-cabeças online: sozinho, em dupla ou em disputa. Para 16+. | 80 (usa 75) |
| Tipo de app | Jogo | |
| Categoria | Quebra-cabeça | |
| E-mail de contato | o mesmo da política de privacidade (confira a grafia antes de salvar) | |
| Site | https://quebra-apk.onrender.com | |
| Política de privacidade | https://quebra-apk.onrender.com/privacidade.html | |
| Exclusão de conta | https://quebra-apk.onrender.com/excluir-conta.html | |

### Descrição completa (limite de 4.000 caracteres)

```
Quebra-Cabeça a Dois é um jogo de quebra-cabeça online para montar do seu jeito: sozinho, junto com outra pessoa na mesma imagem ou em disputa para ver quem termina primeiro.

COMO JOGAR
• Sozinho: escolha uma imagem e a quantidade de peças e monte no seu ritmo.
• Com outra pessoa: os dois montam a mesma imagem ao mesmo tempo, cada um no seu celular, vendo as peças se moverem em tempo real.
• Sala Desafio: cada jogador monta o próprio tabuleiro com a mesma imagem. Vence quem encaixar a última peça primeiro. São dois modos: Comum e Quebrando Cabeças, em que uma caixa surpresa solta as peças.

IMAGENS E DIFICULDADE
• Quebra-cabeças de 6, 12, 20, 30 ou 48 peças.
• Coleções por tema: Fauna brasileira, Natureza e biomas, Espaço e ciência, Cultura brasileira e Mundos fantásticos.
• Novas coleções são liberadas conforme você joga.

PROGRESSO
• Níveis e XP a cada quebra-cabeça concluído.
• Mais de 100 conquistas para completar.
• Gemas ganhas jogando, usadas para liberar coleções e bandejas decorativas na loja. Não há compras com dinheiro real.
• Seus melhores tempos ficam guardados.

SALAS PRIVADAS E SEGURANÇA
• Jogue com outra pessoa numa sala privada, entrando pelo código da sala. Os dois aparecem só como Jogador 1 e Jogador 2.
• Sem e-mail, sem senha e sem lista de amigos: o próprio jogo cria um perfil com apelido sorteado e um código-chave para você voltar a qualquer aparelho.
• Quando a conversa está ligada, usa apenas frases prontas: não há bate-papo livre.
• Você pode bloquear e denunciar outros jogadores.

CONFORTO
• Modo escuro, texto maior e movimento reduzido.
• Sons e vibração ajustáveis.
• Dicas para ver a imagem e o lugar de uma peça.

PRIVACIDADE
• Dá para jogar como visitante, sem criar conta.
• A conta é opcional e serve para guardar o progresso.
• Sem propaganda e sem rastreadores de terceiros.
• Você pode excluir a sua conta a qualquer momento, dentro do app.

Não indicado para menores de 16 anos. Requer conexão com a internet.
```

## 2. Elementos gráficos

Arquivos no pacote `material-da-loja.zip`, já no tamanho e formato que a Play exige (PNG de 24 bits, sem transparência, nas capturas e no gráfico).

| Campo no Play Console | Arquivo do pacote | Tamanho |
| --- | --- | --- |
| Ícone do app | `icone-512x512.png` | 512 × 512 |
| Gráfico de recursos | `grafico-de-destaque-1024x500.png` | 1024 × 500 |
| Capturas de tela do smartphone (envie nesta ordem) | `capturas/1-inicio.png` | 1080 × 1920 |
| | `capturas/3-partida.png` | 1080 × 1920 |
| | `capturas/2-galeria.png` | 1080 × 1920 |
| | `capturas/4-conquistas.png` | 1080 × 1920 |
| | `capturas/5-perfil.png` (**refazer**: a tela de Amigos e a de Perfil do amigo não existem mais) | 1080 × 1920 |

- As capturas são do app real. Os perfis das capturas devem ser de teste (apelido sorteado e ID gerado), nunca de pessoas reais. **As capturas 5 e 6 antigas (Amigos e Perfil do amigo) estão obsoletas: não envie.**
- Nenhuma captura mostra personagem de terceiros nem pessoa real. A galeria usada é a categoria Fauna brasileira.
- Capturas de tablet (7 e 10 polegadas) são opcionais e não foram feitas.

## 3. Público-alvo e conteúdo

O jogo é declarado como **não indicado para menores de 16 anos**: sem nenhuma faixa abaixo de 16. Caminho: **Política › Conteúdo do app › Público-alvo e conteúdo**. Os nomes das perguntas podem variar um pouco na tela.

| Pergunta | Resposta |
| --- | --- |
| Faixas etárias do público-alvo | Marque 16–17 e 18 ou mais. Não marque 5 ou menos, 6–8, 9–12 nem 13–15. |
| A página da loja pode atrair crianças sem querer? | Sim. O mascote e parte das ilustrações são em estilo de desenho. |
| O app contém anúncios? | Não |

- Responder "Sim" à pergunta sobre atrair crianças é a resposta honesta. Pelo que a Play documenta, ela passa a mostrar na loja o aviso de que o app não foi criado para crianças, o que reforça a sua declaração de 16+ (não verificado na conta do proprietário).
- A ferramenta que gera o pacote (PWABuilder/Bubblewrap) avisa que apps desse tipo não podem ter público infantil. Declarar 16+ é compatível.
- Mantenha a coerência: não use "para crianças", "infantil" ou "para a criançada" na loja, em redes sociais ou em anúncios do jogo.
- No app, uma **tela de idade neutra** (mês e ano de nascimento, guardados só no aparelho) aparece antes de tudo: menores de 16 anos não jogam e, se havia conta, ela é apagada. O cadastro pede a confirmação "Tenho 16 anos ou mais" e a política de privacidade diz o mesmo.
- **Instruções de acesso para o revisor da Play:** "Ao abrir o app, informe um mês e um ano de nascimento de alguém com 16 anos ou mais (por exemplo, janeiro de 1990). O modo visitante não precisa de conta."

## 4. Segurança dos dados

Declare que o app coleta dados, não compartilha com terceiros, criptografa em trânsito e permite pedir a exclusão. Caminho: **Política › Conteúdo do app › Segurança dos dados**. As respostas seguem o que o código faz hoje e o que a política de privacidade diz.

### Perguntas gerais

| Pergunta | Resposta |
| --- | --- |
| O app coleta ou compartilha dados do usuário? | Sim |
| Todos os dados são criptografados em trânsito? | Sim (o site só responde por HTTPS) |
| Os usuários podem pedir a exclusão dos dados? | Sim |
| Link para pedir a exclusão da conta | https://quebra-apk.onrender.com/excluir-conta.html |
| Há como criar conta no app? | Sim: um perfil gerado pelo próprio jogo (ID + código-chave), sem e-mail nem senha (o perfil é opcional) |

### Tipos de dados coletados

Para todos: **Coletado = Sim**, **Compartilhado = Não**, **Processamento temporário = Não**, **Obrigatório ou opcional = Opcional** (dá para jogar como visitante).

| Categoria na Play | Tipo | O que é no jogo | Finalidades a marcar |
| --- | --- | --- | --- |
| Informações pessoais | Nome | Apelido sorteado pelo jogo (a pessoa não digita nome) | Funcionalidade do app; Gerenciamento de contas |
| Informações pessoais | IDs de usuário | ID do perfil gerado pelo jogo e código-chave (guardado só como hash) | Funcionalidade do app; Gerenciamento de contas; Segurança |
| Atividade no app | Interações no app | Partidas, tempos, XP, gemas, conquistas, bloqueios e itens da loja (bandejas desbloqueadas com gemas, bandeja em uso e cores) | Funcionalidade do app |
| Atividade no app | Outro conteúdo gerado pelo usuário | Nota opcional de até 200 letras numa denúncia | Funcionalidade do app; Prevenção de fraudes, segurança e conformidade |
| Mensagens | Outras mensagens no app | Frases prontas trocadas na partida (ficam só na memória da sala) | Funcionalidade do app |
| IDs do dispositivo ou outros | IDs do dispositivo ou outros | Endereço de notificação do aparelho, só se a pessoa ligar os avisos (fica só na memória da sala) | Funcionalidade do app |

### O que marcar como "não coletado"

Localização, informações financeiras, saúde e condicionamento físico, fotos e vídeos, arquivos de áudio, arquivos e documentos, agenda, contatos, navegação na Web, apps instalados e dados de diagnóstico.

- **Por que "não compartilhado":** Render (hospedagem), Neon (banco) e Brevo (só o aviso de denúncia ao responsável, sem e-mail de jogador) processam os dados em seu nome. A Play não conta provedores de serviço como compartilhamento.
- **Itens declarados por cautela:** as duas últimas linhas da tabela ficam só na memória do servidor por pouco tempo. Declarar a mais não gera punição; declarar a menos gera.
- **Mudança nesta etapa:** o app **deixou de coletar e-mail**. Se você já tinha preenchido o formulário com "Endereço de e-mail", **atualize** a declaração. Se um dia ligar login com o Google, e-mail, anúncios ou compras, este formulário precisa ser refeito.

## 5. Classificação de conteúdo

O questionário deve resultar numa classificação baixa com o aviso de interação entre usuários; quem define o resultado é a Play. Caminho: **Política › Conteúdo do app › Classificação de conteúdo**. Informe o seu e-mail e escolha a categoria **Jogo**.

| Tema do questionário | Resposta |
| --- | --- |
| Violência | Não |
| Medo ou terror | Não |
| Sexualidade ou nudez | Não |
| Linguagem imprópria | Não |
| Drogas, álcool ou tabaco | Não |
| Jogos de azar ou apostas, reais ou simulados | Não |
| Humor grosseiro | Não |
| Os usuários podem interagir ou trocar conteúdo? | Sim: salas privadas entre duas pessoas (identificadas só como Jogador 1 e 2) e frases prontas na partida |
| Há conversa de texto livre, voz ou vídeo? | Não: a conversa usa só frases prontas |
| O app compartilha a localização do usuário? | Não |
| Permite comprar itens digitais com dinheiro real? | Não |
| Tem itens aleatórios pagos (caixas de recompensa)? | Não |

- A caixa surpresa do modo Quebrando Cabeças só solta as peças do próprio quebra-cabeça. Não é comprada nem dá prêmio, então não é caixa de recompensa.
- As gemas são ganhas jogando e não podem ser compradas. A loja do jogo (bandejas) aceita só essas gemas: **não há compras no app com dinheiro real** (na Play, responder "não" a compras no app).
- Se a tela perguntar sobre moderação, a resposta é: há bloqueio e denúncia de jogadores, e as denúncias chegam ao responsável pelo jogo.

## 6. Acesso ao app e demais declarações

Os revisores da Play **não precisam de conta de teste**: o perfil é criado pelo próprio jogo, sem e-mail, senha nem confirmação. Caminho: **Política › Conteúdo do app › Acesso ao app**.

### O que colocar em "Acesso ao app"

Marque que parte do app é restrita (a sala com outra pessoa) e cadastre as instruções abaixo.

```
O jogo pode ser usado sem perfil: toque em "Jogar" > "Sozinho" para montar um quebra-cabeça.
Ao abrir, informe um mês e um ano de nascimento de alguém com 16 anos ou mais (por exemplo, janeiro de 1990).
Para testar perfil, salas e bloqueio: toque em "Entrar" (canto superior direito da tela inicial) > "Criar perfil",
marque as duas caixas e anote o ID e o código-chave. Não é preciso e-mail nem senha.
A sala com outra pessoa (cooperativo e Sala Desafio) precisa de dois aparelhos, cada um com seu perfil:
um cria a sala e passa o código da sala, o outro entra com esse código.
O servidor pode levar até 60 segundos para responder na primeira abertura.
```

### Outras declarações

| Declaração | Resposta |
| --- | --- |
| Anúncios | O app não contém anúncios |
| ID de publicidade | O app não usa ID de publicidade (o pacote não pede essa permissão) |
| App de governo | Não |
| Recursos financeiros | Nenhum |
| App de saúde | Não |
| App de notícias | Não |
| Permissões do pacote | Só notificações (`POST_NOTIFICATIONS`), pedida quando a pessoa liga os avisos |

A última linha das instruções deixa de ser necessária se a hospedagem passar para um plano que não dorme.

## 7. AAB: envio, assinatura e assetlinks

O arquivo a enviar é `quebra-cabeca-a-dois-v2.aab`, do pacote `app-para-a-play.zip`. Foi gerado com o Bubblewrap 1.27.0 e validado com o `bundletool` 1.18.3 (código de saída 0).

| Item | Valor conferido no arquivo |
| --- | --- |
| Pacote | `com.onrender.quebra_apk.twa` (o mesmo do APK atual; é permanente na Play) |
| Versão | versionCode 2, versionName 2 |
| targetSdk | 36 (o exigido pela Play desde 31/08/2026) |
| minSdk | 24 (Android 7.0 ou mais novo) |
| Permissões | Só notificações |
| Assinatura | Chave de envio nova, SHA-256 `12:D9:5C:57:7A:58:76:0A:A1:65:68:6A:DC:C1:F7:41:BB:0D:A4:3E:A9:AB:94:29:A1:5C:D2:EF:7F:59:AD:1F` |

### Enviar

1. No Play Console, crie o app: nome Quebra-Cabeça a Dois, idioma português (Brasil), tipo Jogo, gratuito.
2. Abra **Testar e lançar › Testes › Teste fechado** e crie uma versão.
3. Aceite a **Assinatura de apps do Google Play** (é o padrão) e envie o arquivo `.aab`.
4. Salve a versão. Os nomes dos menus podem variar um pouco.

### Tirar a barra de endereço (assetlinks)

O Android só abre o app sem a barra de endereço se o site conhecer a chave que assinou o app instalado. O APK de teste mostrou a barra porque o site só conhecia a chave do APK antigo (confirmado pela API `assetlinks:check` do Google). O arquivo `public/assetlinks.json` deste repositório agora lista as duas chaves (APK antigo e chave de envio); publique-o antes de testar. Para quem instalar pela Play, falta ainda a chave que a Play usa para assinar o app:

1. Depois do envio, abra **Testar e lançar › Configuração › Integridade do app › Assinatura de apps**.
2. Copie a **impressão digital SHA-256 da chave de assinatura do app** (não a da chave de upload).
3. Abra o arquivo `assetlinks-para-o-render.json` e troque o texto `COLE_AQUI_...` por essa impressão digital.
4. No Render, em **Environment**, crie a variável `ASSETLINKS_JSON` com o conteúdo inteiro do arquivo, em uma linha, e salve. Ela vence o arquivo do repositório e deve conter as três impressões.
5. Quando ficar **Live**, abra `https://quebra-apk.onrender.com/diagnostico` e confira em `verificacao_do_aplicativo` as três impressões digitais.

| Impressão digital | De quem é | Para que fica no arquivo |
| --- | --- | --- |
| `99:50:38:B0:…:5A:53` | APK antigo do PWABuilder | Quem já instalou o APK continua sem barra |
| `12:D9:5C:57:…:AD:1F` | Chave de envio nova | O APK de teste abre sem barra |
| a que a Play mostrar | Chave de assinatura da Play | Quem instalar pela loja abre sem barra |

### Cuidados

- **Guarde a pasta `chave-de-envio`** fora do GitHub. Toda atualização futura precisa dessa chave e da senha que está em `dados-da-chave.txt`.
- A chave foi gerada no ambiente do assistente e passou por uma conversa. Se achar que vazou, peça a redefinição da chave de upload na mesma tela de Assinatura de apps.
- O `quebra-cabeca-a-dois-v2-teste.apk` serve para testar no celular antes da loja. Desinstale o APK antigo antes, porque a assinatura é outra.
- Pelo mesmo motivo, quem tem o APK antigo instalado precisa desinstalá-lo antes de instalar a versão da Play.
- Mudanças no jogo (site) continuam chegando sozinhas. Só é preciso um AAB novo se mudar o endereço, o ícone, o nome ou quando a Play exigir um targetSdk mais novo; nesse caso o versionCode tem de ser maior que 2.
- O Google guarda o resultado do vínculo em cache por até cerca de 1 hora: depois de publicar, repita a consulta `assetlinks:check` até aparecer `linked: true`.

## 8. Teste fechado de 14 dias e pedido de produção

Contas pessoais criadas depois de 13/11/2023 só podem pedir a publicação depois de um teste fechado com pelo menos 12 testadores inscritos por 14 dias seguidos. Contas de organização são isentas.

1. Reúna 12 ou mais pessoas com conta Google. Convide algumas a mais, porque quem sair zera a própria contagem.
2. No teste fechado, crie uma lista de e-mails com essas contas e salve.
3. Envie a cada pessoa o **link de participação** que a tela mostra. Cada uma precisa aceitar o convite e instalar o app pela Play.
4. Peça que usem o jogo de verdade nesses 14 dias e anote o retorno que derem.
5. Passados os 14 dias, o painel libera **Solicitar acesso à produção**. As perguntas são sobre como foi o teste e o que você melhorou.
6. A análise do pedido costuma levar até cerca de 7 dias. Depois disso você cria a versão de produção com o mesmo AAB.

- Preencha as seções 3 a 6 deste documento antes de liberar a versão aos testadores: a Play também revisa versões de teste.
- Durante o teste, mantenha o servidor acordado ou avise os testadores da demora na primeira abertura.

## 9. Pendências e riscos que continuam abertos

O pacote e os textos estão prontos, mas estes pontos ainda dependem do proprietário ou não foram verificados.

- [ ] **Conta de desenvolvedor:** criar, pagar a taxa única e concluir a verificação de identidade.
- [ ] **Publicar a correção do vínculo (assetlinks):** depois do deploy, repita a consulta `assetlinks:check` do Google até aparecer `linked: true` para a chave de envio (o cache pode levar até cerca de 1 hora), desinstale o APK de teste e instale de novo.
- [ ] **Teste em Android real:** nem o AAB nem o APK de teste foram instalados num aparelho de verdade. Confira a abertura sem barra de endereço, o botão voltar, o teclado e o mascote num celular simples.
- [ ] **Hospedagem:** o Render gratuito dorme. A primeira resposta levou 11 a 22 segundos nas medições de 09/11/2026. Um plano que não dorme evita que testadores e revisores vejam tela em branco.
- [ ] **ECA Digital (Lei 15.211/2025):** confirmar com um profissional se um jogo com salas privadas entre duas pessoas e apelidos sorteados (sem amigos, convites, e-mail ou nomes reais), para 16 anos ou mais, está dentro da lei. Perguntas ao profissional: (a) "até 16 anos", no art. 24, inclui quem tem exatamente 16? (b) a tela de idade neutra e a autodeclaração bastam como mecanismo de aferição? (c) um jogo com salas privadas e frases prontas conta como rede social? (d) a arte em desenho faz o jogo ser de "acesso provável" por menores de 16, mesmo declarando 16+?
- [ ] **E-mail de contato:** conferir a grafia do endereço que aparece na política de privacidade e na página de exclusão antes de repeti-lo na loja.
- [ ] **Aviso de denúncia por e-mail:** fazer uma denúncia de teste entre dois perfis seus para confirmar que o e-mail chega pelo Brevo de verdade.
- [ ] **Capa da coleção Cultura brasileira:** mostra uma pessoa. Confirmar a origem e a licença dessa imagem no catálogo.
- [ ] **Endereço `onrender.com`:** o pacote aponta para ele. Trocar por domínio próprio depois exige um AAB novo.
- [ ] **Estilo visual:** o mascote e as ilustrações clássicas são em desenho. A declaração de 16+ e os textos estão coerentes, mas a avaliação final é da Play.
