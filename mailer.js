'use strict';
/*
 * Envio de e-mails (código para confirmar o e-mail e código para trocar a senha) por API WEB (HTTPS).
 * Não usa SMTP: o plano gratuito do Render bloqueia as portas de SMTP (25, 465 e 587).
 *
 * Variáveis do Render (escolha UM serviço):
 *   Brevo (recomendado, plano gratuito: 300 e-mails por dia, aceita um e-mail seu como remetente):
 *     BREVO_API_KEY   a chave da API (começa com "xkeysib-")
 *     MAIL_FROM       o e-mail remetente, JÁ CONFIRMADO no Brevo (ex.: seuemail@gmail.com)
 *   Resend (precisa de um domínio próprio verificado):
 *     RESEND_API_KEY  e  MAIL_FROM (um endereço do seu domínio)
 *   (opcional) MAIL_FROM_NAME  nome que aparece como remetente (padrão: "Quebra-cabeça a dois")
 *   (só para testes) MAIL_PROVIDER=test  guarda as mensagens na memória, sem enviar nada
 * Sem chave e sem remetente, o envio fica DESLIGADO (o jogo funciona, mas sem confirmação de e-mail nem recuperação de senha).
 */
function createMailer(env, fetchImpl) {
  const kind = String(env.MAIL_PROVIDER || (env.BREVO_API_KEY ? 'brevo' : (env.RESEND_API_KEY ? 'resend' : ''))).toLowerCase();
  const from = String(env.MAIL_FROM || '').trim();
  const fromName = String(env.MAIL_FROM_NAME || 'Quebra-cabeça a dois').slice(0, 60);
  const doFetch = fetchImpl || fetch;
  const timeout = () => AbortSignal.timeout(12000);

  if (kind === 'test') {                                           // só para testes automáticos: nada sai do servidor
    const outbox = [];
    return { provider: 'test', from: from || 'teste@exemplo.com', outbox, async send(msg) { outbox.push(Object.assign({ at: Date.now() }, msg)); } };
  }
  if (!from || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(from.replace(/^.*<([^>]+)>$/, '$1'))) return null;

  if (kind === 'brevo' && env.BREVO_API_KEY) {
    const url = env.MAIL_API_URL || 'https://api.brevo.com/v3/smtp/email';
    return {
      provider: 'brevo', from,
      async send({ to, subject, text, html }) {
        const r = await doFetch(url, {
          method: 'POST', signal: timeout(),
          headers: { 'api-key': env.BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({ sender: { name: fromName, email: from.replace(/^.*<([^>]+)>$/, '$1') }, to: [{ email: to }], subject, htmlContent: html, textContent: text })
        });
        if (!r.ok) throw new Error('Brevo respondeu ' + r.status);        // nunca registra a chave nem o corpo da resposta
      }
    };
  }
  if (kind === 'resend' && env.RESEND_API_KEY) {
    const url = env.MAIL_API_URL || 'https://api.resend.com/emails';
    return {
      provider: 'resend', from,
      async send({ to, subject, text, html }) {
        const r = await doFetch(url, {
          method: 'POST', signal: timeout(),
          headers: { authorization: 'Bearer ' + env.RESEND_API_KEY, 'content-type': 'application/json' },
          body: JSON.stringify({ from: fromName + ' <' + from.replace(/^.*<([^>]+)>$/, '$1') + '>', to: [to], subject, html, text })
        });
        if (!r.ok) throw new Error('Resend respondeu ' + r.status);
      }
    };
  }
  return null;
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

module.exports = { createMailer, codeEmail };
