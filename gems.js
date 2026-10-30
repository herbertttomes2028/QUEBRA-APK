'use strict';
/* Gemas são gratuitas, acumuladas somente no servidor. Nenhuma compra ou gasto existe nesta versão. */
const xpm = require('./xp');
const VALUES = Object.freeze({ 6: 1, 12: 2, 20: 3, 30: 5, 48: 8 });
function forCompletion(pieces) { return VALUES[Number(pieces)] || 0; }
function forLevel(level) {
  if (!Number.isInteger(level) || level < 2 || level > 100) return 0;
  return level < 10 ? 10 : level < 20 ? 15 : level < 30 ? 20 : level < 50 ? 30 : 50;
}
function crossedLevels(before, after) {
  const result = [];
  for (let n = Math.max(2, before + 1); n <= Math.min(after, 100); n++) result.push({ level: n, gems: forLevel(n) });
  return result;
}
/* Sempre chamar dentro da transação de XP, após SELECT users ... FOR UPDATE. */
async function creditTx(q, uid, ref, pieces, eligible, beforeXp, afterXp) {
    let match = 0, level = 0;
    async function credit(key, kind, amount, meta) {
      if (amount <= 0) return 0;
      const r = await q(`INSERT INTO gem_events (user_id, ref, kind, amount, meta)
                         VALUES ($1,$2,$3,$4,$5) ON CONFLICT (user_id, ref) DO NOTHING RETURNING amount`,
        [uid, key, kind, amount, JSON.stringify(meta)]);
      return r.rowCount ? Number(r.rows[0].amount) : 0;
    }
    if (eligible) match = await credit('match:' + ref, 'match', forCompletion(pieces), { pieces });
    for (const bonus of crossedLevels(xpm.levelFromXp(beforeXp), xpm.levelFromXp(afterXp))) {
      level += await credit('level:' + bonus.level, 'level', bonus.gems, { level: bonus.level });
    }
    const total = match + level;
    const row = total ? (await q('UPDATE users SET gems = gems + $1 WHERE id = $2 RETURNING gems', [total, uid])).rows[0] :
      (await q('SELECT gems FROM users WHERE id = $1', [uid])).rows[0];
    return { match, level, balance: Number(row.gems) };
}
module.exports = { VALUES, forCompletion, forLevel, crossedLevels, creditTx };
