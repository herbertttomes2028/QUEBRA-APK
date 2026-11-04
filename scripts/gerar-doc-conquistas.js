#!/usr/bin/env node
'use strict';
/* Gera o CONQUISTAS.md A PARTIR DO CATÁLOGO (achievements.js), para a documentação nunca ficar diferente do jogo.
 * Uso:  node scripts/gerar-doc-conquistas.js        (reescreve CONQUISTAS.md)
 * Um teste confere que o arquivo do repositório é exatamente o que este gerador produz. */
const fs = require('node:fs');
const path = require('node:path');
const A = require('../achievements');

const quem = (a) => (a.secret ? 'Segredo (só você)' : a.pub ? 'Público' : 'Só você');
function render() {
  const out = [];
  const stat = A.STATIC.filter((a) => !a.retired);
  const xpFixas = A.list().filter((a) => !a.retired && !a.cat).reduce((s, a) => s + a.xp, 0);          // só as fixas: as por categoria dependem do catálogo de imagens
  out.push('# Conquistas e coleções', '',
    'Este arquivo é **gerado** a partir de `achievements.js` (`node scripts/gerar-doc-conquistas.js`). Um teste confere que ele continua igual ao jogo.', '',
    '## Como funciona', '',
    '- **Calculadas, não digitadas:** o servidor calcula cada conquista a partir do histórico (partidas, imagens concluídas, amigos, nível). O celular nunca diz "ganhei".',
    '- **Permanentes:** o pagamento do XP grava `ach:<id>` em `xp_events`. Quem ganhou **continua com a conquista** mesmo que o número mude depois (remover um amigo, o catálogo de imagens crescer...).',
    '- **XP só pelo caminho de sempre:** as conquistas pagam XP dentro da mesma transação do XP da partida (`awardAchievements`, em `accounts.js`), **uma vez cada**, em até 6 passadas (o XP de uma pode liberar a seguinte, como as de nível).',
    '- **Retroativas:** quem já cumpre uma conquista nova recebe o XP dela na próxima partida (com um aviso resumido). O XP vira nível e o nível dá gemas, então os valores abaixo são pequenos de propósito.', '',
    '### XP por nível', '',
    '| Nível | XP |', '|---|---:|',
    ...Object.entries(A.TIERS).map(([k, t]) => `| ${t.icon} ${t.label} | ${t.xp} |`), '',
    'As 10 conquistas que já existiam **mantêm o XP de antes** (25, 40, 40, 100, 50, 100, 80, 25, 25 e 60).', '',
    '### Privacidade (crianças)', '',
    'O perfil de **amigo** recebe **só as conquistas "Público"**, e só "ganhou ou não": nunca progresso, tempos, XP, número de amigos, dias ou horários de jogo, nem segredos. Velocidade, amizade, constância e segredos são **"Só você"**.', '',
    `**Total de XP das conquistas fixas:** ${xpFixas.toLocaleString('pt-BR')}. As conquistas por categoria somam até ${Object.values(A.TIERS).reduce((t, x) => t + x.xp, 0)} XP **por categoria** (as 4 de cada uma).`, '');
  for (const g of A.GROUPS) {
    const rows = stat.filter((a) => a.g === g.id);
    if (g.id === 'categorias') continue;
    out.push(`## ${g.icon} ${g.title}`, '', `_${g.blurb}_`, '', '| | Conquista | Como ganhar | Nível | XP | Quem vê |', '|---|---|---|---|---:|---|');
    for (const a of rows) out.push(`| ${a.icon} | **${a.title}** | ${a.desc} | ${A.TIERS[a.tier].icon} ${A.TIERS[a.tier].label} | ${A.list().find((x) => x.id === a.id).xp} | ${quem(a)} |`);
    out.push('');
  }
  out.push('## 🗂️ Por categoria', '', '_Nascem sozinhas do catálogo de imagens: uma categoria nova ganha as dela._', '',
    'Para cada categoria com `N` imagens (e `gate` = quantas liberam a seguinte):', '',
    '| Id | Como ganhar | Nível | Quando existe |', '|---|---|---|---|',
    '| `cat_<id>_1` | Concluir a 1ª imagem | 🥉 Bronze | sempre |',
    '| `cat_<id>_g` | Concluir as `gate` primeiras | 🥈 Prata | se `1 < gate < N` |',
    '| `cat_<id>_h` | Concluir metade (`⌈N/2⌉`) | 🥇 Ouro | se `N ≥ 6` e a metade fica entre o `gate` e `N` |',
    '| `cat_<id>_all` | Concluir todas as `N` | 💎 Diamante (🥇 se `N < 10`) | se `N ≥ 2` |', '',
    'Títulos das categorias que existem hoje:', '',
    '| Categoria | 1ª imagem | Explorador | Metade | Todas |', '|---|---|---|---|---|',
    ...Object.entries(A.CAT_TITLES).map(([id, t]) => `| \`${id}\` | ${t.join(' | ')} |`), '',
    'Uma categoria que não está na tabela usa títulos genéricos ("Primeiro passo: …", "Explorador: …").', '',
    '## Aposentada', '', '- **Minha imagem** (`imagem`): o envio de fotos próprias foi removido. Quem já ganhou continua com ela; para os outros ela não aparece.', '');
  return out.join('\n');
}
if (require.main === module) { fs.writeFileSync(path.join(__dirname, '..', 'CONQUISTAS.md'), render()); console.log('CONQUISTAS.md gerado'); }
module.exports = { render };
