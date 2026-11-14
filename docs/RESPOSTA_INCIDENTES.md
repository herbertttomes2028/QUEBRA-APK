# Resposta a incidentes de segurança — Quebra-Cabeça a Dois

Data: 14/11/2026 · Este é um **roteiro prático**, não um parecer jurídico. A obrigação de comunicar incidentes à ANPD e aos titulares depende do caso concreto: **consulte um profissional** (ver seção 5). Não transforme todo erro técnico em "incidente comunicável" automaticamente, nem esconda um incidente real.

## 1. Quem faz o quê
- **Responsável:** Herbert (proprietário), único com acesso ao Render, Neon, Brevo e GitHub.
- **Contato público:** o e-mail da política de privacidade (confirmar a grafia: ver `CONTINUIDADE.md`, item 49).
- **Provedores:** Render (servidor), Neon (banco), Brevo (aviso de denúncia), GitHub (código).

## 2. Passo geral (qualquer incidente)
1. **Conter**: reduza o dano antes de investigar (seção 3).
2. **Registrar** em um arquivo seu (fora do GitHub): data/hora, o que foi visto, o que foi feito, quem soube. Sem copiar códigos-chave, tokens nem dados de crianças para conversas ou prints.
3. **Avaliar**: dados pessoais foram acessados, alterados, perdidos ou expostos? De quantos perfis? (O jogo não guarda e-mail de perfis gerados; os dados são ID, apelido sorteado, progresso e hash do código-chave. Contas legadas ainda guardam e-mail.)
4. **Decidir sobre a comunicação** (seção 5), com apoio profissional.
5. **Corrigir e testar** (com um teste novo que reproduza o problema), publicar pelo fluxo normal (ramificação → Pull request → Merge → Manual Deploy).
6. **Registrar o que aprendeu** no `CONTINUIDADE.md`.

## 3. Cenários

### A) Suspeita de que o banco vazou (acesso indevido ao Neon)
- **O que o atacante teria:** `secret_hash` (scrypt, com sal), `sessions.token_hash` (SHA-256 de token aleatório), IDs, apelidos, progresso, denúncias; nas contas legadas, e-mails.
- **Conter:** troque a senha do banco no Neon e a `DATABASE_URL` no Render; apague todas as sessões (`DELETE FROM sessions;` no SQL Editor: todos terão de entrar de novo); revise quem tem acesso ao Neon.
- **Observação técnica:** o código-chave tem ≈ 99 bits e só existe como scrypt; adivinhar a partir do hash é inviável com a tecnologia comum, mas **não é impossível por definição**: se houver dúvida, peça aos jogadores *Gerar código novo*.
- **Comunicação:** avaliar (seção 5).

### B) Um jogador diz que alguém entrou no perfil dele
- Peça que ele use **Perfil › Segurança › Gerar código novo** (o código antigo deixa de valer e as sessões dos **outros** aparelhos são encerradas; o aparelho de quem pediu continua) e, se quiser, **Sair de todos os aparelhos**. Se ele não consegue entrar, **não há como provar a titularidade só pelo ID** (ver D).
- Procure um padrão (muitos perfis afetados = possível vazamento do banco ou bug: cenário A ou C).

### C) Gemas ou itens aparecendo "do nada" (bug ou fraude)
- Gemas e XP só mudam pelo servidor (`gem_events`, `xp_events`, `shop_purchases` guardam o histórico). Consulte esses registros para achar o que gerou o ganho.
- Corrija com migração/rota nova e **um teste de regressão**. Não edite saldo "no escuro": registre o motivo.

### D) Pedido de exclusão ou de dados **sem o código-chave**
- Quem pede só com o ID **não provou** que o perfil é dele (o ID é público). Antes de apagar: peça algo que só o titular saiba (por exemplo, o apelido atual, a data aproximada de criação, a partida salva) e, no caso de criança/adolescente, a confirmação de um responsável. Registre o que foi pedido e o que foi feito. **Prazo prometido na política: 15 dias.**
- Não envie dados do perfil por e-mail para quem não provou a titularidade.

### E) Denúncia grave (ameaça, aliciamento, menor em risco)
- O jogo **não tem chat livre**; ainda assim, apelidos sorteados e salas privadas podem ser usados de forma indevida fora do jogo (o código da sala é repassado por outro meio). Guarde a denúncia (`reports`), **não repasse o conteúdo**, e oriente a pessoa a procurar um adulto de confiança e as autoridades. Se for crime, procure a polícia/Delegacia. Registre.
- Se for preciso excluir o perfil denunciado: o e-mail de denúncia traz o ID; use o comando do próprio e-mail (só de e-mails que chegaram do jogo).

### F) Segredo exposto (chave do Brevo, `DATABASE_URL`, `DIAG_TOKEN`, chave de assinatura Android)
- **Troque** o segredo no provedor **antes** de apagar o arquivo/print onde apareceu (apagar do histórico do GitHub não desfaz o vazamento).
- `DIAG_TOKEN`: crie outro valor no Render. `BREVO_API_KEY`: gere outra no Brevo e revogue a antiga. Banco: veja A. Chave de assinatura Android: **não** publique; consulte a documentação da Play antes de qualquer troca.
- Rode `gitleaks dir .` e o teste `tests/sem-segredos.test.js`.

### G) Queda do servidor ou do banco
- Render dormindo/Neon acordando não são incidentes de segurança. Se o banco ficar indisponível, o jogo continua como visitante (seção 4.3 de `docs/MIGRACAO_E_ROLLBACK.md` explica o botão de emergência).

## 4. Contenção rápida (comandos)

| Objetivo | Como |
| --- | --- |
| Derrubar todas as sessões | Neon › SQL Editor: `DELETE FROM sessions;` |
| Desligar perfis temporariamente | Render › Environment: apagar `DATABASE_URL` (o jogo vira só-visitante) |
| Desligar chat e avisos | `CHAT_ENABLED=false`, `PUSH_ENABLED=false` (já estão assim) |
| Bloquear tentativas em massa | os limites já existem (seção 4 de `docs/SEGURANCA_INVENTARIO.md`); reiniciar o serviço zera os contadores |
| Apagar um perfil | pelo jogador (Apagar meus dados) ou pelo e-mail de denúncia (só comandos que vieram do jogo) |

## 5. Comunicação à ANPD e aos titulares (**obrigação condicionada: procure orientação profissional**)

- Segundo a orientação jurídica anexada ao projeto (que não substitui o texto legal), a **Resolução CD/ANPD nº 15/2024** trata da comunicação de incidentes de segurança com dados pessoais **nas hipóteses e prazos regulamentares** (regra geral de **3 dias úteis** quando houver comunicação devida). Confira o texto vigente antes de decidir.
- Pontos a avaliar: o incidente pode acarretar **risco ou dano relevante** aos titulares? Há dados de **crianças e adolescentes** (o jogo é indicado para 16+, mas a idade é autodeclarada)? Quantos titulares? Os dados estavam protegidos (hash)?
- **Agente de pequeno porte** (Res. CD/ANPD nº 2/2022) pode ter flexibilizações, mas não dispensa a LGPD.
- Não prometa na política que "nunca" haverá incidente.

## 6. Registros (Marco Civil, art. 15) e retenção
O jogo **não grava IP no banco**; o Render/Neon podem manter registros técnicos por seus próprios prazos. A orientação anexada alerta que o art. 15 do Marco Civil (guarda de registros de acesso por 6 meses para provedores que se enquadrem) precisa de **análise de enquadramento**: não afirme "nenhum registro" sem essa análise.

## 7. Testes e simulações
Nenhum **simulado de incidente** foi feito com o proprietário. Sugestão: ensaiar uma vez o passo "derrubar todas as sessões" e o "botão de emergência" num banco de teste do Neon.
