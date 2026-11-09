'use strict';
/*
 * Envio de e-mails (código para confirmar o e-mail e código para trocar a senha) pela API do BREVO (HTTPS).
 * Não usa SMTP: o plano gratuito do Render bloqueia as portas de SMTP (25, 465 e 587).
 *
 * Variáveis do Render (o e-mail só fica LIGADO quando as duas primeiras existem e não estão vazias):
 *   BREVO_API_KEY       a chave da API do Brevo (começa com "xkeysib-"). Nunca vai para o código nem para o GitHub.
 *   BREVO_SENDER_EMAIL  o e-mail remetente, JÁ CONFIRMADO no Brevo.
 *   BREVO_SENDER_NAME   (opcional) nome que aparece como remetente. Padrão: "Quebra-cabeça a dois".
 * Sem as duas primeiras, o envio fica DESLIGADO: o jogo funciona, só sem confirmação de e-mail nem recuperação de senha.
 */
const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';

function readEnv(env) {
  return {
    key: String(env.BREVO_API_KEY || '').trim(),
    email: String(env.BREVO_SENDER_EMAIL || '').trim(),
    name: (String(env.BREVO_SENDER_NAME || '').trim() || 'Quebra-cabeça a dois').slice(0, 60)
  };
}
// só para os testes automáticos (precisa dos DOIS: MAIL_PROVIDER=test e NODE_ENV=test; no Render nunca acontece)
const isTest = (env) => String(env.MAIL_PROVIDER || '').toLowerCase() === 'test' && String(env.NODE_ENV || '') === 'test';

// diz se o e-mail está ligado e, se não estiver, QUAIS variáveis faltam (só os nomes, nunca os valores)
function mailerStatus(env) {
  if (isTest(env)) return { on: true, provider: 'test', missing: [], badEmail: false };
  const b = readEnv(env), missing = [];
  if (!b.key) missing.push('BREVO_API_KEY');
  if (!b.email) missing.push('BREVO_SENDER_EMAIL');
  const badEmail = !!b.email && !EMAIL_RE.test(b.email);       // remetente com cara de errado: melhor desligar do que travar os cadastros
  return { on: !missing.length && !badEmail, provider: 'brevo', missing, badEmail };
}

function createMailer(env, fetchImpl) {
  const stats = { enviados: 0, falhas: 0, ultimo_erro: null };     // aparece em /diagnostico (só texto já limpo)
  if (isTest(env)) {
    const outbox = [];
    return { provider: 'test', from: 'teste@exemplo.com', outbox, stats, async send(msg) { outbox.push(Object.assign({ at: Date.now() }, msg)); stats.enviados++; } };
  }
  if (!mailerStatus(env).on) return null;
  const b = readEnv(env);
  const doFetch = fetchImpl || fetch;
  const url = env.NODE_ENV === 'test' && env.MAIL_API_URL ? env.MAIL_API_URL : BREVO_URL;     // o endereço só pode ser trocado nos testes
  // texto de erro seguro para o registro e para o /diagnostico: apaga a chave, e-mails e endereços de IP
  const redact = (s) => String(s || '').split(b.key).join('***').replace(/[^\s@"'<>()]+@[^\s@"'<>()]+/g, '***@***').replace(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g, '***.***.***.***').slice(0, 200);
  const falhou = (status, texto) => { stats.falhas++; stats.ultimo_erro = { quando: new Date().toISOString(), status, texto }; };
  return {
    provider: 'brevo', from: b.email, stats,
    async send({ to, subject, text, html }) {
      let r;
      try {
        r = await doFetch(url, {
          method: 'POST', signal: AbortSignal.timeout(12000),
          headers: { 'api-key': b.key, 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({ sender: { name: b.name, email: b.email }, to: [{ email: to }], subject, htmlContent: html, textContent: text })
        });
      } catch (e) { falhou(0, 'sem resposta do Brevo (rede ou tempo esgotado)'); throw Object.assign(new Error('sem resposta do Brevo (rede ou tempo esgotado)'), { status: 0 }); }
      if (!r.ok) {
        let det = '';
        try { const j = await r.json(); det = [j.code, j.message].filter(Boolean).join(': '); } catch (e) { /* sem detalhe */ }
        // vai só para o registro do servidor; nunca para o usuário, e a chave é apagada do texto se aparecer
        const texto = 'Brevo respondeu ' + r.status + (det ? ' (' + redact(det) + ')' : '');
        falhou(r.status, texto);
        throw Object.assign(new Error(texto), { status: r.status });
      }
      stats.enviados++;
    }
  };
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// textos dos e-mails (curtos, em português, sem links)
function codeEmail(purpose, code, name) {
  const verify = purpose === 'verify';
  const subject = verify ? 'Seu código para confirmar o e-mail — Quebra-cabeça a dois' : 'Seu código para trocar a senha — Quebra-cabeça a dois';
  const intro = verify ? 'Use este código para confirmar o seu e-mail no jogo:' : 'Use este código para criar uma nova senha no jogo:';
  const text = `Olá${name ? ', ' + name : ''}!\n\n${intro}\n\n    ${code}\n\nEle vale por 15 minutos e só pode ser usado uma vez.\nSe não foi você que pediu, ignore esta mensagem: nada será alterado e ninguém entra na sua conta só com este e-mail.\n\nQuebra-cabeça a dois`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:20px;color:#1b2559"><h2 style="margin:0 0 8px">Quebra-cabeça a dois 🧩</h2><p>Olá${name ? ', ' + esc(name) : ''}!</p><p>${intro}</p><p style="font-size:34px;font-weight:bold;letter-spacing:8px;background:#eaeeff;border-radius:14px;padding:14px 18px;text-align:center;margin:18px 0">${code}</p><p>Ele vale por <b>15 minutos</b> e só pode ser usado uma vez.</p><p style="color:#5a6499;font-size:14px">Se não foi você que pediu, ignore esta mensagem: nada será alterado.</p></div>`;
  return { subject, text, html };
}

/* ---------- aviso de denúncia para quem cuida do jogo ----------
 * Segurança: o texto NUNCA traz o e-mail, o código nem o apelido de QUEM denunciou; só o que é preciso para agir contra a pessoa denunciada
 * (apelido da hora, código de amigo, motivo, onde, nota). Apelido e nota são texto de jogador (não confiáveis): saem sem caracteres de controle,
 * escapados no HTML, e NUNCA entram dentro dos comandos SQL (só o código de amigo, que é conferido contra o alfabeto do jogo). Sem links nem imagens. */
const FRIEND_CODE_RE = /^[2-9A-HJKMNP-Z]{8}$/;                       // o mesmo alfabeto dos códigos de amigo (sem 0, 1, I, L, O)
const REPORT_REASON_TXT = { apelido: 'Apelido ou avatar ofensivo', comportamento: 'Comportamento ruim (ofensa, assédio, trapaça)', outro: 'Outro motivo' };
const REPORT_WHERE_TXT = { perfil: 'no perfil do amigo', amigos: 'na lista de amigos (menu ⋯)', sala: 'dentro de uma partida' };
const okEmail = (s) => typeof s === 'string' && s.length <= 254 && /^[^\s@<>()"',;:\\]+@[^\s@<>()"',;:\\]+\.[^\s@<>()"',;:\\]+$/.test(s);

// Para onde vai o aviso: REPORT_NOTIFY_EMAIL, ou (se não existir) o remetente confirmado no Brevo. Valor inválido DESLIGA (nunca envia a um endereço duvidoso).
function reportTarget(env, mailer) {
  const set = String((env && env.REPORT_NOTIFY_EMAIL) || '').trim();
  if (set) return okEmail(set) ? { to: set, origem: 'REPORT_NOTIFY_EMAIL' } : { to: null, problema: 'REPORT_NOTIFY_EMAIL tem formato inválido' };
  if (mailer && okEmail(mailer.from)) return { to: mailer.from, origem: 'remetente do Brevo' };
  return { to: null, problema: mailer ? 'sem destino (defina REPORT_NOTIFY_EMAIL)' : 'e-mail do Brevo desligado' };
}

function reportEmail(r) {
  const limpa = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
  const code = FRIEND_CODE_RE.test(String(r.code || '')) ? String(r.code) : '';
  const id = Number.isSafeInteger(Number(r.id)) && Number(r.id) > 0 ? Number(r.id) : 0;
  const motivo = REPORT_REASON_TXT[r.reason] || REPORT_REASON_TXT.outro, onde = REPORT_WHERE_TXT[r.context] || REPORT_WHERE_TXT.perfil;
  const nome = limpa(r.name, 40) || '(sem apelido)', nota = limpa(r.note, 200);
  const quando = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Fortaleza', dateStyle: 'short', timeStyle: 'short' }).format(r.at instanceof Date ? r.at : new Date());
  const extra = Math.max(0, Math.floor(Number(r.skipped) || 0));
  const codeFmt = code ? code.slice(0, 4) + '-' + code.slice(4) : '(indisponível)';
  const sql = code
    ? [`update users set name = 'Jogador', avatar = '' where friend_code = '${code}';`, `delete from users where friend_code = '${code}';`, `update reports set status = 'analisado' where id = ${id};`]
    : [`select u.friend_code from reports r join users u on u.id = r.reported where r.id = ${id};`, `update reports set status = 'analisado' where id = ${id};`];
  const passos = code
    ? ['1) Trocar o apelido (e tirar o avatar):', '2) OU excluir a conta (apaga tudo dela):', '3) Marcar esta denúncia como analisada:']
    : ['1) Descobrir o código da pessoa:', '2) Marcar esta denúncia como analisada:'];
  const subject = `Denúncia nova (#${id}) — Quebra-cabeça a dois`;
  const aviso = extra ? `\n\nATENÇÃO: mais ${extra} denúncia(s) nesta hora não vieram por e-mail (limite por hora). Veja todas no Neon: select * from reports where status = 'novo' order by created_at desc;` : '';
  const text = [`Denúncia nova no Quebra-cabeça a dois (#${id})`, '',
    `Motivo: ${motivo}`, `Onde: ${onde}`, `Quando: ${quando} (horário de Fortaleza)`, `Apelido da pessoa denunciada: "${nome}"`, `Código de amigo: ${codeFmt}` + (code ? `   (no banco: ${code})` : ''),
    `Nota de quem denunciou: ${nota ? '"' + nota + '"' : '(nenhuma)'}`, '',
    'O QUE FAZER (Neon › SQL Editor). Escolha UMA das ações e rode o comando:', '',
    ...passos.flatMap((p, i) => [p, '    ' + sql[i], '']),
    'Privacidade: este e-mail não traz o e-mail, o código nem o apelido de quem denunciou. Não encaminhe e apague depois de resolver.' + aviso].join('\n');
  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:20px;color:#1b2559"><h2 style="margin:0 0 8px">Denúncia nova 🚩 (#${id})</h2>`
    + `<p><b>Motivo:</b> ${esc(motivo)}<br><b>Onde:</b> ${esc(onde)}<br><b>Quando:</b> ${esc(quando)} (horário de Fortaleza)<br><b>Apelido da pessoa denunciada:</b> “${esc(nome)}”<br>`
    + `<b>Código de amigo:</b> <span style="font-size:1.25em;font-weight:bold;letter-spacing:.06em">${esc(codeFmt)}</span>${code ? ` <small>(no banco: ${esc(code)})</small>` : ''}<br>`
    + `<b>Nota de quem denunciou:</b> ${nota ? '“' + esc(nota) + '”' : '(nenhuma)'}</p>`
    + `<p><b>O que fazer</b> (Neon › SQL Editor). Escolha <b>uma</b> ação e rode o comando:</p>`
    + passos.map((p, i) => `<p style="margin:10px 0 2px">${esc(p)}</p><pre style="background:#eef1ff;padding:10px;border-radius:8px;white-space:pre-wrap;word-break:break-all;margin:0">${esc(sql[i])}</pre>`).join('')
    + `<p style="color:#55608f;font-size:.85em;margin-top:16px">Privacidade: este e-mail não traz o e-mail, o código nem o apelido de quem denunciou. Não encaminhe e apague depois de resolver.</p>`
    + (extra ? `<p style="color:#b00020"><b>Atenção:</b> mais ${extra} denúncia(s) nesta hora não vieram por e-mail (limite por hora). Veja todas no Neon.</p>` : '') + '</div>';
  return { subject, text, html };
}

module.exports = { createMailer, mailerStatus, codeEmail, reportEmail, reportTarget, FRIEND_CODE_RE };
