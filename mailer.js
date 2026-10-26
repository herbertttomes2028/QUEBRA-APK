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
  if (isTest(env)) {
    const outbox = [];
    return { provider: 'test', from: 'teste@exemplo.com', outbox, async send(msg) { outbox.push(Object.assign({ at: Date.now() }, msg)); } };
  }
  if (!mailerStatus(env).on) return null;
  const b = readEnv(env);
  const doFetch = fetchImpl || fetch;
  const url = env.NODE_ENV === 'test' && env.MAIL_API_URL ? env.MAIL_API_URL : BREVO_URL;     // o endereço só pode ser trocado nos testes
  const redact = (s) => String(s || '').split(b.key).join('***').slice(0, 160);
  return {
    provider: 'brevo', from: b.email,
    async send({ to, subject, text, html }) {
      let r;
      try {
        r = await doFetch(url, {
          method: 'POST', signal: AbortSignal.timeout(12000),
          headers: { 'api-key': b.key, 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({ sender: { name: b.name, email: b.email }, to: [{ email: to }], subject, htmlContent: html, textContent: text })
        });
      } catch (e) { throw Object.assign(new Error('sem resposta do Brevo (rede ou tempo esgotado)'), { status: 0 }); }
      if (!r.ok) {
        let det = '';
        try { const j = await r.json(); det = [j.code, j.message].filter(Boolean).join(': '); } catch (e) { /* sem detalhe */ }
        // vai só para o registro do servidor; nunca para o usuário, e a chave é apagada do texto se aparecer
        throw Object.assign(new Error('Brevo respondeu ' + r.status + (det ? ' (' + redact(det) + ')' : '')), { status: r.status });
      }
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

module.exports = { createMailer, mailerStatus, codeEmail };
