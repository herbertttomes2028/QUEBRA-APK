# Controles LGPD / ECA Digital — o que é obrigação, o que é recomendação

Data-base: 14/11/2026 · **Não sou advogado e este documento não é parecer jurídico.** Ele organiza a orientação jurídico-técnica anexada ao projeto ("LEIS LGPD ANPD PARA ORIENTAÇÃO DO CLAUD", v1.0, data-base 13/11/2026) e relaciona cada ponto ao que o código **faz de fato**. A própria orientação pede: consultar o texto legal vigente e um profissional habilitado antes de publicar. Onde há **controvérsia**, ela é registrada, sem fingir certeza.

**Como ler a coluna "Natureza":** **(a)** obrigação expressa · **(b)** obrigação condicionada ao enquadramento · **(c)** interpretação controvertida · **(d)** recomendação técnica preventiva (não é lei).

## 1. Matriz de controles

| # | Tema | Base / referência | Natureza | O que o projeto faz hoje | Lacuna ou dúvida |
| --- | --- | --- | --- | --- | --- |
| 1 | Minimização de dados | LGPD art. 6º, III | (a) princípio | Sem nome, e-mail, telefone, CPF, foto, localização. Apelido sorteado; ID gerado; progresso | Contas legadas ainda guardam e-mail até serem apagadas |
| 2 | Pseudônimo não é anônimo | LGPD arts. 5º, I e 12 | (a) | O ID persistente + histórico é tratado como **dado pessoal potencial** (política e documentos dizem isso) | Definir base legal e retenção formalmente (ver item 4) |
| 3 | Segurança | LGPD arts. 6º, VII; 46–49 | (a) | Hash scrypt, sessões revogáveis, limites de tentativa, CSP, cabeçalhos, logs sem segredos, testes (ver `AUDITORIA_SEGURANCA.md`) | Revisão independente **não feita**; Android real **não testado** |
| 4 | Base legal e finalidade | LGPD arts. 7º, 9º, 14; Enunciado CD/ANPD 1/2023 | (a)/(b) | A política descreve o que é guardado e por quê | A **base legal escolhida não está documentada** por escrito; melhor interesse da criança/adolescente a analisar com profissional |
| 5 | Transparência | LGPD art. 9º | (a) | `public/privacidade.html` reescrita em 14/11/2026 para o perfil gerado | Revisão jurídica do texto; nome completo do controlador não consta (só "Herbert") |
| 6 | Direitos do titular (acesso, correção, exclusão) | LGPD arts. 17–18 | (a) | Exclusão no app (código-chave) e na página pública; pedido por e-mail em até 15 dias | Atender **sem e-mail de cadastro** exige confirmar a titularidade (ver `RESPOSTA_INCIDENTES.md`, cenário D). Não há tela de "baixar meus dados" |
| 7 | Término do tratamento / retenção | LGPD arts. 15–16 | (a) | Perfil e tudo ligado a ele apagam em cascata; sessões 60 dias | **Não há expiração automática** de perfis inativos; sem política de retenção por prazo |
| 8 | Registro das operações | LGPD art. 37 | (a) | Este diretório `docs/` + `CONTINUIDADE.md` | Não é um RIPD formal; pequeno porte pode ter regime simplificado (Res. CD/ANPD 2/2022): **confirmar** |
| 9 | Incidentes | LGPD art. 48; Res. CD/ANPD 15/2024 | (b) | Roteiro em `RESPOSTA_INCIDENTES.md` | Nunca ensaiado; critério de "risco relevante" a definir com profissional |
| 10 | Responsabilidade do usuário | LGPD arts. 42–45 | (a) | A política orienta a guardar o código-chave | **Não** se pode transferir toda a responsabilidade ao usuário por falha de segurança do fornecedor (a política não faz isso) |
| 11 | Registros de acesso | Marco Civil art. 15 | (b) | O jogo não grava IP no banco; provedores gravam o deles | Análise de enquadramento pendente; não prometer "nenhum registro" |
| 12 | Escopo do ECA Digital ("acesso provável") | Lei 15.211/2025, art. 1º, parágrafo único; Guia ANPD 28/10/2026 | (b)/(c) | O jogo foi tratado **como provavelmente abrangido** (jogos têm presunção segundo o guia) | Fundamentar por escrito o enquadramento; reavaliar quando mudar funcionalidade |
| 13 | Interação em jogos (art. 21) | Lei 15.211/2025, art. 21; Lei 14.852/2024, art. 16 | (b)/(c) | Sem chat livre (frases prontas, hoje **desligado**), sem amigos, sem feed, sem perfil público; salas privadas de 2, "Jogador 1/2" | **Controvérsia**: troca de eventos do quebra-cabeça conta como "troca de conteúdos"? Registrado; sem resposta oficial conhecida |
| 14 | Vinculação de contas de até 16 ao responsável (art. 24) | Lei 15.211/2025, art. 24 | (c) | Não implementada. O jogo **não é uma rede social** (art. 2º, III), então a leitura restritiva sustenta que não se aplica | **Controvérsia**: o *caput* é amplo. "Até 16" inclui quem tem 16. Não confundir autorização de aparelho com vínculo de responsável |
| 15 | Aferição/sinal de idade | Lei 15.211/2025, arts. 12–14; Decreto 12.880/2026, arts. 24–27 | (b) | Tela de idade neutra (mês/ano, **só no aparelho**), idade autodeclarada; consentimento de 16+ ao criar perfil | Autodeclaração é o nível **mais fraco**; sinais de idade das lojas não integrados; sem coleta de documento (de propósito) |
| 16 | Classificação indicativa | Lei 14.852/2024; MJSP (autoclassificação/IARC) | (a)/(b) | O produto hoje se declara **"não indicado para menores de 16 anos"** (decisão do proprietário em 13/11/2026; constante `MIN_YEARS` em `public/idade.js` e campo `age16` no servidor) | A orientação diz para **buscar a menor classificação cabível, após avaliação formal**, e **não presumir 16+**. Decisão pendente: analisar conteúdo real (imagens infantis do Baú das Maravilhas, mascote) e reclassificar pelo fluxo oficial |
| 17 | Loot boxes | Lei 15.211/2025, art. 20; Decreto 12.880/2026, arts. 15, 23 | (a) proibição específica | Itens da loja têm **preço fixo em gemas ganhas jogando**, conteúdo conhecido; não há compra com dinheiro real nem sorteio pago. A "caixa" do modo Quebrando Cabeças só solta peças do próprio quebra-cabeça | Documentar a mecânica (feito em `README.md`); não introduzir sorteio pago |
| 18 | Compras e transações | Lei 14.852/2024, art. 17 | (b) | Não há dinheiro real. Gemas só se ganham jogando | Se um dia houver compra com dinheiro: revisão especial |
| 19 | Publicidade | Lei 15.211/2025, arts. 22, 26; Decreto art. 33; CDC art. 37, §2º; Conanda 163/2014 | (a)/(b) | **Não há anúncios, SDKs nem rastreadores** | Se vier no futuro: desligado por padrão e só após revisão formal |
| 20 | Práticas de uso problemático | Decreto 12.880/2026, arts. 9º–10 | (b) | Recompensas fixas (não há recompensa aleatória paga). **Não foi feita análise formal** de uso problemático (tempo de uso, pet, recompensas) | Revisar o desenho de recompensas e o pet com profissional |
| 21 | Canal de denúncia | Lei 15.211/2025, art. 28; Decreto art. 41; Lei 14.852/2024, art. 16 | (b) | Denunciar/bloquear pelo menu da partida; a pessoa denunciada não é avisada; o aviso ao responsável por e-mail **não** identifica quem denunciou | Falta **protocolo/resposta ao denunciante e revisão de decisões** (art. 16, se incidir); o art. 29, §2º (notificação com identificação) **não** foi implementado e **não** deve ser estendido a toda denúncia |
| 22 | Relatórios semestrais | Lei 15.211/2025, art. 31 | (b) | Não aplicável: exige mais de 1 milhão de menores de 18 registrados | — |
| 23 | Termos de uso | LGPD/CDC | (b) | **Não existem termos de uso separados** (só a política) | Redigir com profissional |

## 2. O que foi pedido e **não** foi feito (para decisão do proprietário)

1. **Passkeys/WebAuthn** e **confirmação por aparelho antigo**: não implementados (recomendação técnica, item "d"; dependem de teste em WebView/TWA real).
2. **Aprovação do anfitrião / QR Code** nas salas: não implementados. A descrição correta do produto é "salas privadas acessíveis por código compartilhado diretamente" (a orientação alerta que isso **não prova relação pessoal**).
3. **Migração de contas legadas com preservação de progresso** e **rollback de dados**: não implementados (ver `MIGRACAO_E_ROLLBACK.md`).
4. **Retenção por prazo** (expirar perfis inativos) e **exportação dos dados** do titular.
5. **Termos de uso**, **base legal documentada**, **RIPD** e **classificação indicativa formal**.

## 3. Perguntas para o profissional jurídico (consolidadas)

1. O art. 24 (vinculação até 16) alcança jogo não social, dado o *caput* amplo? Em caso positivo, o que serve como "vínculo" sem coletar e-mail?
2. Eventos técnicos do quebra-cabeça em sala privada de 2 pessoas são "troca de conteúdos" para o art. 21 / art. 16 da Lei 14.852?
3. A autodeclaração de idade com tela neutra basta como aferição proporcional (Decreto 12.880, arts. 24–27)? Há sinais de idade da loja que devem ser integrados?
4. Qual a **menor classificação indicativa** cabível para este conteúdo, e por qual fluxo (autoclassificação MJSP/IARC)? Manter "não indicado para menores de 16" é necessário ou excessivo?
5. Qual a base legal adequada (LGPD arts. 7º/14; Enunciado 1/2023) para o perfil pseudônimo de adolescentes e de adultos?
6. O jogo se enquadra como agente de tratamento de pequeno porte (Res. 2/2022)? Que obrigações simplificam?
7. Como atender direitos do titular (acesso/exclusão) **sem e-mail de cadastro**, sem expor dados a quem não é o titular?
8. O art. 15 do Marco Civil se aplica a este serviço (e, portanto, a guarda de 6 meses de registros de acesso)?
9. O texto da política e dos termos reflete corretamente o produto?

## 4. Conclusão honesta
O projeto reduziu muito a exposição (sem e-mail, amigos, convites, chat livre, nomes reais ou anúncios) e isso é aderente à **minimização** (LGPD art. 6º, III). **Isso não afasta, sozinho, o ECA Digital**: a orientação anexada afirma que reduzir funcionalidades "não é instrumento automático de exclusão". Não há aqui nenhuma afirmação de conformidade legal total; **a decisão final exige revisão jurídica**.
