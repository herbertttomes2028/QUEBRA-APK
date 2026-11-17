'use strict';
/*
 * Anúncios RECOMPENSADOS (AdSense "H5 Games Ads" / Ad Placement API do Google). DESLIGADOS POR PADRÃO.
 *
 * Variáveis do Render (Environment):
 *   ADS_MODO        desligado (padrão, ou qualquer valor desconhecido) | simulado | teste | real
 *                     simulado = um "anúncio" de mentira, feito pelo próprio jogo, SEM internet e SEM Google (para testar o fluxo e as gemas)
 *                     teste    = script do Google com data-adbreak-test="on" (anúncios de teste, sem valor)
 *                     real     = anúncios de verdade (só depois de o site estar aprovado no AdSense)
 *   ADS_CLIENT      ca-pub-0000000000000000 (obrigatório em teste/real; sem ele, ou inválido, os anúncios ficam DESLIGADOS)
 *   ADS_GEMAS       gemas por anúncio assistido até o fim (1 a 5; padrão 2)
 *   ADS_LIMITE_DIA  anúncios recompensados por perfil por dia, no horário de Fortaleza (1 a 10; padrão 3)
 *   ADS_INTERVALO_S segundos mínimos entre dois anúncios do mesmo perfil (30 a 3600; padrão 120)
 *
 * Regras de proteção (ECA Digital art. 22 e Decreto 12.880/2026 art. 33; ver "LEIS LGPD ANPD" no projeto):
 *   - sempre anúncios NÃO personalizados (requestNonPersonalizedAds = 1) e marcados como público menor de idade
 *     (tag-for-child-directed-treatment e tag-for-under-age-of-consent);
 *   - nunca para visitante (sem perfil), nunca durante a partida, nunca pelo pet; só quando a pessoa toca no botão da Loja;
 *   - recompensa fixa e conhecida antes (nada aleatório), limite por dia e intervalo mínimo.
 */
const MODOS = Object.freeze(['desligado', 'simulado', 'teste', 'real']);
const CLIENT_RE = /^ca-pub-\d{10,20}$/;
const SIMULADO_S = 5;                       // duração do anúncio de mentira (o servidor exige pelo menos SIMULADO_S - 1 s)

function clampInt(v, min, max, dflt) {
  const n = Number.parseInt(String(v == null ? '' : v).trim(), 10);
  return Number.isInteger(n) ? Math.min(max, Math.max(min, n)) : dflt;
}

function fromEnv(env) {
  env = env || {};
  let modo = String(env.ADS_MODO || '').trim().toLowerCase();
  if (!MODOS.includes(modo)) modo = 'desligado';
  const client = String(env.ADS_CLIENT || '').trim();
  let aviso = '';
  if ((modo === 'teste' || modo === 'real') && !CLIENT_RE.test(client)) { aviso = 'ADS_CLIENT ausente ou inválido (formato ca-pub-...): anúncios desligados'; modo = 'desligado'; }
  const rede = modo === 'teste' || modo === 'real';
  return Object.freeze({
    modo,
    ligado: modo !== 'desligado',
    rede,                                   // true = carrega o script do Google
    client: rede ? client : '',
    pub: rede ? client.replace(/^ca-/, '') : '',
    gemas: clampInt(env.ADS_GEMAS, 1, 5, 2),
    limite: clampInt(env.ADS_LIMITE_DIA, 1, 10, 3),
    intervalo: clampInt(env.ADS_INTERVALO_S, 30, 3600, 120),
    minSegundos: modo === 'simulado' ? SIMULADO_S - 1 : 3,
    aviso
  });
}

/* O que o celular pode saber (nunca há segredo aqui: o ca-pub é público por natureza, aparece no código de qualquer site com AdSense). */
function publicInfo(cfg) {
  if (!cfg.ligado) return { modo: 'desligado' };
  return { modo: cfg.modo, client: cfg.client, gemas: cfg.gemas, limite: cfg.limite, intervalo: cfg.intervalo, simuladoS: SIMULADO_S };
}

/* Origens do Google que o script de anúncios usa. Só entram na CSP quando cfg.rede (teste/real). */
const CSP_EXTRA = Object.freeze({
  script: ['https://pagead2.googlesyndication.com', 'https://*.googlesyndication.com', 'https://*.google.com', 'https://*.gstatic.com', 'https://*.adtrafficquality.google'],
  frame: ['https://googleads.g.doubleclick.net', 'https://*.doubleclick.net', 'https://tpc.googlesyndication.com', 'https://*.googlesyndication.com', 'https://www.google.com', 'https://*.adtrafficquality.google'],
  img: ['https:'],
  connect: ['https://*.googlesyndication.com', 'https://*.google.com', 'https://*.doubleclick.net', 'https://*.gstatic.com', 'https://*.adtrafficquality.google']
});

/* /ads.txt: a linha oficial do Google (o código f08c47fec0942fa0 é o identificador fixo do Google, igual para todos). */
function adsTxt(cfg) { return cfg.rede ? 'google.com, ' + cfg.pub + ', DIRECT, f08c47fec0942fa0\n' : ''; }

/* Política de privacidade: o arquivo tem dois trechos marcados; o servidor entrega só o que vale para o modo atual. */
function privacyHtml(html, ligado) {
  const fora = ligado ? 'SEM-ANUNCIOS' : 'COM-ANUNCIOS';
  const re = new RegExp('<!--' + fora + '-->[\\s\\S]*?<!--/' + fora + '-->', 'g');
  return String(html).replace(re, '').replace(/<!--\/?(SEM|COM)-ANUNCIOS-->/g, '');
}

module.exports = { MODOS, SIMULADO_S, fromEnv, publicInfo, CSP_EXTRA, adsTxt, privacyHtml, clampInt };
