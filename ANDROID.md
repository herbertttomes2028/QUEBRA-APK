# Navegação no Android, conclusão, bate-papo e abertura: o que mudou e como testar

## 1. O que foi corrigido (e a causa de cada problema)
| Problema | Causa encontrada | Correção |
|---|---|---|
| Sem como fechar a imagem de conclusão | As janelas `modal-win` (cooperativo) e `modal-duel` (desafio) só tinham botões de ação | Botão **✕** (44 px, canto superior direito, fica visível se a janela rolar) e atalho **🏆 Ver resultado** para reabrir. Nada é perdido e a conexão não é encerrada |
| Bate-papo e frases sobrepostos | Um painel de altura fixa empilhava histórico, reações e a grade de frases (até 36% da tela), que invadia o histórico em celular pequeno | Duas **visões exclusivas** (`chat` ou `phrases`): só uma existe na tela por vez. O histórico não é recriado, então não se perde |
| Botão voltar fechava o app | Nenhum tratamento do histórico (`popstate`) | Gerenciador central: um nível por toque; na raiz, 2 toques em até 2 s |
| Endereço do Render aparecendo | (a) o app esperava a rede, em branco, quando o Render dormia (medi 22 s); (b) o `socket.io.js` travava o início; (c) 11 janelas nativas `confirm/prompt` e links `target="_blank"`, que mostram o endereço | Abertura **instantânea** (cópia no celular, atualizada por trás), confirmação própria do app, privacidade dentro do app e aviso "Acordando o servidor…" com nova tentativa |

## 2. Como o botão voltar funciona
- Só atua no **aplicativo instalado** (modo "standalone"/TWA). No navegador comum nada muda.
- Ordem: pergunta de confirmação → janelas → carregando/contagem → bate-papo (frases → conversa → fechar) → tela atual (escolha de imagem → início; conta → início; partida/sala → pergunta "Sair?").
- Dentro de uma partida o voltar **nunca desconecta sozinho**: pergunta "Sair da partida?" (ou "Sair da disputa? Seu adversário vence.").
- Tela inicial: 1º toque mostra "Pressione voltar novamente para sair do aplicativo."; o 2º em até ~2 s fecha o app (quem fecha é o Android). Depois de 2 s a proteção volta.
- Convites e pedidos de revanche não são aceitos nem recusados pelo voltar.

## 3. Como publicar com segurança (sem mexer na versão que está no ar)
1. No GitHub, abra o repositório > menu de ramificações (**main**) > digite `correcoes-navegacao-android` > **Create branch**.
2. Estando nessa ramificação, **Add file > Upload files** e envie os arquivos do `LEIA-ME.txt`, mantendo as pastas. Em "Commit changes", escolha **Commit directly to the correcoes-navegacao-android branch** (não a `main`).
3. O Render publica a `main`, então nada muda no ar ainda. Quando quiser, abra um **Pull request** e faça o **Merge**.
4. Para desfazer: no Pull request mesclado, use **Revert**.

## 4. Teste no celular Android real (o que eu NÃO pude testar)
1. **Abrir o app instalado** (o do APK, não o Chrome). Veja se aparece a barra de endereço.
2. **Voltar na tela inicial:** 1 toque → aviso; 2º toque em até 2 s → fecha. Repita esperando 3 s entre os toques → não fecha e mostra o aviso de novo.
3. **Voltar nas telas:** Criar partida > voltar (vai ao início); Ajustes > voltar (fecha); conta > voltar.
4. **Partida a dois:** voltar abre "Sair da partida?"; "Continuar jogando" mantém tudo; o amigo continua vendo você conectado.
5. **Concluir uma partida:** toque no ✕ e confira "🏆 Ver resultado"; reabra; "Jogar de novo" ainda funciona.
6. **Bate-papo:** abra a conversa > "Frases prontas": a conversa some; ‹ volta; mande uma frase e o painel volta à conversa.
7. **Servidor dormindo:** deixe 20 min sem abrir (o Render gratuito dorme) e abra o app: a tela do jogo deve aparecer na hora, com o aviso "Acordando o servidor…" até conectar.
8. **Sair da conta / remover amigo:** a pergunta deve ser do próprio jogo (sem título com o endereço do site).

## 5. Se o endereço ainda aparecer
O código web já não expõe o endereço. Se uma barra com o endereço ainda aparecer no app instalado, a causa está **fora do repositório**:
- **Verificação do app:** o `assetlinks.json` está correto (200, JSON, sem redirecionamento, 1 impressão digital). A barra aparece quando a verificação falha ou demora; com o Render dormindo, ela pode demorar.
- **Chave do APK:** a impressão digital (SHA-256) do `assetlinks.json` precisa ser a da chave que **assinou o APK instalado**. Se o app for para a Play Store, a Google reassina e é preciso **somar** a impressão digital dela (o arquivo aceita várias).
- **PWABuilder:** ao gerar o APK, confira a opção de comportamento alternativo ("fallback"): "Custom Tabs" mostra a barra de endereço se a verificação falhar; "Web View" não mostra. Confira o nome exato na tela do PWABuilder.
- **Definitivo:** plano pago do Render (o servidor deixa de dormir) e, depois, um **domínio próprio** (exige gerar um APK novo).

## 6. Observações
- **Primeira abertura depois de um deploy:** o app abre a cópia guardada e baixa a nova por trás; a versão nova entra na próxima vez que a pessoa estiver na tela inicial (nunca no meio de uma partida).
- **`public/imagens/mini/`:** o repositório não tinha miniaturas. As 17 deste pacote deixam a galeria mais leve (736 KB no total, em vez de baixar as imagens inteiras).
- **Duas imagens muito pesadas:** `Fundo para Combinar com Imagem.png` (1,86 MB) e `APARECIDA.png` (1,24 MB). Recomendo reduzi-las (por exemplo, para menos de 300 KB); não alterei suas imagens.
- **Faxina sugerida:** apague o `index.html` da **raiz** do repositório (versão antiga, nunca usada) e preencha o e-mail de contato em `public/privacidade.html` (ainda mostra "[PREENCHER...]").
