'use strict';

/*
 * Quebra-Cabeça a Dois — servidor
 * Express serve a pasta /public e o Socket.IO sincroniza as duas pessoas.
 * O servidor é a "fonte da verdade": ele decide quem segura cada peça,
 * quando uma peça encaixa e quando o jogo termina.
 */

const crypto = require('crypto');
const library = require('./library');
const shopCatalog = require('./shop');
const magnet = require('./magnet');
const dragDwell = magnet.createDwell();          // "ficou perto por um instante" do ímã ao arrastar (cooperativo e Solo)
const fileira = require('./fila');               // FILEIRA DE 5 (20, 30 e 48 peças): as peças vão aparecendo numa fileira só, abaixo da grade
// Liga por padrão. Para voltar à bandeja grande de antes sem mexer no código: no Render, FILEIRA=0 (também aceita false/off/nao).
const FILEIRA_ON = !['0', 'false', 'off', 'nao', 'não', 'no'].includes(String(process.env.FILEIRA || '').trim().toLowerCase());
const FILEIRA_BW = 980;                          // grade mais larga (igual ao Quebrando Cabeças): a imagem fica maior
const FILEIRA_T_MAX = 160;                       // peça na fileira: até 160 (5 vagas de 200 no campo de 1000; sobra folga para os encaixes)
// Origem externa das imagens da biblioteca (opcional). Valor inválido é IGNORADO e o jogo segue com os arquivos locais (falha fechada).
{ const m = library.configureMedia(process.env.MEDIA_BASE_URL); if (process.env.MEDIA_BASE_URL) console.log(m ? '[biblioteca] imagens externas em ' + m.origin : '[biblioteca] MEDIA_BASE_URL inválida: usando os arquivos locais'); }
const security = require('./security');
const { makeProtection } = require('./resource-guard');
const protection = makeProtection();
// SEC-11, rede final: uma promessa recusada que ninguém tratou NÃO derruba o servidor (no Node atual ela encerraria o processo inteiro, com
// todas as salas). Hoje não há caminho conhecido que chegue aqui; se um dia aparecer, fica registrado (só a mensagem, nunca dados) e o jogo segue.
// Erros SÍNCRONOS fora dos eventos continuam encerrando o processo (o Render reinicia): esconder isso poderia deixar o servidor num estado ruim.
let rejeicoesSemTratamento = 0, ultimoAvisoRejeicao = 0;
process.on('unhandledRejection', (err) => {
  rejeicoesSemTratamento++;
  const t = Date.now(); if (t - ultimoAvisoRejeicao < 10000) return; ultimoAvisoRejeicao = t;
  let msg = 'erro sem descrição';
  try { msg = String((err && err.message) || err).slice(0, 160); } catch (_) { /* o próprio erro pode ser um objeto que não vira texto */ }
  console.error('[servidor] promessa recusada sem tratamento (ignorada):', msg, '(total ' + rejeicoesSemTratamento + ')');
});
const { createMailer, mailerStatus } = require('./mailer');
const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 3000; // o Render define a PORT automaticamente
const PUBLIC_DIR = path.join(__dirname, 'public');
const IMG_DIR = path.join(PUBLIC_DIR, 'imagens');

/* ---------- Configuração do tabuleiro (unidades lógicas) ---------- */
const FIELD_W = 1000;   // largura da área de jogo
const BOARD_Y = 30;     // margem de cima do tabuleiro
const MAX_ROT = 1000000000; // compatibilidade com clientes antigos; sem limite de giros
const HINTS = 10;       // vezes que cada jogador pode ver a imagem esmaecida no tabuleiro
const MAX_NAME = 12;
const SPOTS = 5;            // vezes que cada jogador pode pedir "onde esta peça encaixa" (📍) por partida
const REMATCH_MS = Number(process.env.REMATCH_MS) || 30000;   // tempo que o amigo tem para aceitar um pedido de recomeçar

// Avatares permitidos (o servidor só aceita estes; qualquer outra coisa vira "sem avatar" e o jogo usa a inicial do nome)
const AVATARS = ['🐱', '🐶', '🦊', '🐼', '🦁', '🐸', '🐵', '🦄', '🐙', '🦋', '⭐', '🚀', '🌈', '🍀'];

// Liga/desliga por variável de ambiente. Desde 15/11/2026 (auditoria SEC-08) o padrão é DESLIGADO: sem a variável (servidor novo ou
// recriado), os avisos ficam desligados; só liga com o valor true (também aceita 1, sim, on, yes). No Render as duas já existem.
const envOn = (v) => ['true', '1', 'sim', 'on', 'yes'].includes(String(v || '').trim().toLowerCase());

// Avisos com o aplicativo fechado (Web Push). As chaves são geradas na hora em que o servidor liga;
// para fixá-las, crie no Render as variáveis VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY. Para ligar: PUSH_ENABLED=true.
// Sem a biblioteca "web-push" instalada, o jogo funciona normalmente, só sem os avisos.
let webpush = null;
let PUSH_PUBLIC = null;
if (envOn(process.env.PUSH_ENABLED)) {
  try {
    webpush = require('web-push');
    let pub = process.env.VAPID_PUBLIC_KEY;
    let priv = process.env.VAPID_PRIVATE_KEY;
    if (!pub || !priv) {
      const k = webpush.generateVAPIDKeys();
      pub = k.publicKey;
      priv = k.privateKey;
    }
    const subject = process.env.VAPID_SUBJECT || process.env.RENDER_EXTERNAL_URL || 'mailto:contato@example.com';
    webpush.setVapidDetails(subject, pub, priv);
    PUSH_PUBLIC = pub;
  } catch (e) {
    webpush = null;
    PUSH_PUBLIC = null;
    console.warn('Avisos com o app fechado desligados: ' + e.message);
  }
}
// o servidor só envia avisos para estes serviços de notificação dos navegadores (evita que alguém use o jogo para
// fazer o servidor acessar endereços quaisquer)
const PUSH_HOSTS = /(^|\.)(googleapis\.com|push\.services\.mozilla\.com|push\.apple\.com|notify\.windows\.com|push\.samsungosp\.com)$/i;
function validPushSub(sub) {
  if (!sub || typeof sub.endpoint !== 'string' || sub.endpoint.length > 1000 || !sub.keys) return false;
  if (typeof sub.keys.p256dh !== 'string' || typeof sub.keys.auth !== 'string') return false;
  if (sub.keys.p256dh.length > 200 || sub.keys.auth.length > 100) return false;
  try {
    const u = new URL(sub.endpoint);
    return u.protocol === 'https:' && PUSH_HOSTS.test(u.hostname);
  } catch (e) {
    return false;
  }
}

// NÃO EXISTE conversa entre jogadores (nem texto livre, nem frases prontas, nem reações/emojis enviados ao outro): o bate-papo foi
// RETIRADO do código por decisão do proprietário em 16/11/2026 (antes ficava só desligado). A variável CHAT_ENABLED não tem mais efeito.

// Quantidades de peças disponíveis (cols × rows). As peças são sempre quadradas;
// a imagem é recortada no centro para caber na proporção da grade.
//  bw = largura do tabuleiro (quanto maior, maiores as peças montadas)
//  t  = tamanho das peças enquanto esperam na bandeja (elas crescem ao serem pegas)
const PRESETS = [
  { pieces: 6,  cols: 2, rows: 3, bw: 840, t: 240, label: 'Bem fácil' },
  { pieces: 12, cols: 3, rows: 4, bw: 960, t: 160, label: 'Fácil' },
  { pieces: 20, cols: 4, rows: 5, bw: 960, t: 135, label: 'Médio' },
  { pieces: 30, cols: 5, rows: 6, bw: 950, t: 120, label: 'Difícil' },
  { pieces: 48, cols: 6, rows: 8, bw: 780, t: 110, label: 'Desafio' },
  // QUANTIDADES GRANDES (rodada pecas-grandes, 17/11/2026, pedido do proprietário): 8 colunas em todas, então a peça tem o MESMO tamanho
  // nas três (a 88 e a 96 só ganham linhas). Valem em todos os modos. Só nelas: ímã mais forte (ima = multiplica o SNAP_FACTOR e o ímã ao
  // arrastar), lâmpada sem limite (lampadaLivre) e mais dicas de lugar 📍 (spots). As outras quantidades continuam exatamente como antes.
  { pieces: 64, cols: 8, rows: 8,  bw: 980, t: 100, label: 'Avançado', grande: true, ima: 1.4, lampadaLivre: true, spots: 10 },
  { pieces: 88, cols: 8, rows: 11, bw: 980, t: 100, label: 'Mestre',   grande: true, ima: 1.4, lampadaLivre: true, spots: 15 },
  { pieces: 96, cols: 8, rows: 12, bw: 980, t: 100, label: 'Lendário', grande: true, ima: 1.4, lampadaLivre: true, spots: 25 }
];
const DEFAULT_PIECES = 12;
const presetOf = (pieces) => PRESETS.find((p) => p.pieces === pieces) || PRESETS.find((p) => p.pieces === DEFAULT_PIECES);
// lâmpada "sem limite": o contador fica neste número e não desce (um celular com a cópia antiga do jogo mostra 999 e continua funcionando)
const HINTS_SEM_LIMITE = 999;
// ÍMÃ DE ENCAIXE: a peça solta encaixa sozinha quando o CENTRO dela fica a até SNAP_FACTOR × (tamanho da casa) do centro da casa certa.
// Padrão 0,35 desde 15/11/2026 (o proprietário pediu um ímã mais fraco: com 0,5 a peça encaixava longe demais da casa; foi 0,33 até
// 10/11/2026 e 0,5 entre 10 e 15/11). Ajustável no Render com SNAP_FACTOR (aceita de 0,25 a 0,75; qualquer outro valor é ignorado e vale
// o padrão). A MESMA fórmula vale na Sala Desafio (challenge.js recebe este valor daqui). Ao ARRASTAR o raio é menor (magnet.js).
const SNAP_FACTOR_DEFAULT = 0.35;
// fator do ímã de uma quantidade: o normal (SNAP_FACTOR) ou, nas quantidades grandes, SNAP_FACTOR × ima (nunca acima de 0,75 casa)
function snapFactorFor(pr) { return Math.min(0.75, SNAP_FACTOR * (pr && pr.ima > 1 ? pr.ima : 1)); }
const hintsFor = (pr) => (pr && pr.lampadaLivre ? HINTS_SEM_LIMITE : HINTS);
const spotsFor = (pr) => (pr && pr.spots > 0 ? pr.spots : SPOTS);
const SNAP_FACTOR = (() => { const v = Number(process.env.SNAP_FACTOR); return process.env.SNAP_FACTOR !== undefined && process.env.SNAP_FACTOR !== '' && Number.isFinite(v) && v >= 0.25 && v <= 0.75 ? v : SNAP_FACTOR_DEFAULT; })();
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem O/0/I/1 para não confundir
// 6 caracteres = ~1,07 bilhão de códigos (com 4 eram ~1 milhão): junto do limite de tentativas, ninguém consegue adivinhar uma sala
const CODE_LEN = Math.max(4, Math.min(8, Number(process.env.CODE_LEN) || 6));
const joinGuard = security.createJoinGuard(process.env);
const mailer = createMailer(process.env);                      // e-mail pela API do Brevo (não SMTP); nulo = desligado
const mailInfo = mailerStatus(process.env);
console.log('[contas] e-mail: ' + (mailer ? 'LIGADO (' + mailer.provider + ')' : 'desligado' + (mailInfo.missing.length ? ' (faltam: ' + mailInfo.missing.join(', ') + ')' : (mailInfo.badEmail ? ' (BREVO_SENDER_EMAIL parece inválido)' : ''))));
// Sem limite de imagens: todas as da pasta public/imagens aparecem. (Opcional: defina MAX_IMAGES no Render para limitar.)
const MAX_IMAGES = Number(process.env.MAX_IMAGES) > 0 ? Math.floor(Number(process.env.MAX_IMAGES)) : Infinity;

// Dados do celular podem ser QUALQUER coisa (inclusive um objeto feito para quebrar String()/Number(); SEC-11): só número e texto passam.
const asNum = (v) => (typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN);
const asStr = (v) => (typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : '');
function validPieces(n, fallback) {
  n = asNum(n);
  return PRESETS.some((p) => p.pieces === n) ? n : fallback;
}

// calcula o desenho do campo para a quantidade de peças escolhida.
// Todas as posições das peças (x, y) são o CENTRO da peça, em unidades lógicas.
function layoutFor(pieces, withFila = false) {
  const pr = presetOf(pieces);
  // FILEIRA DE 5 (15/11/2026): 20, 30 e 48 peças têm UMA fileira de 5 vagas (as outras peças aparecem aos poucos, ver fila.js),
  // então a grade ganha a altura que a bandeja grande ocupava e fica mais larga. 6 e 12 peças continuam como sempre.
  // withFila: só quando TODOS os celulares da sala já têm o jogo novo (filaClient); um celular com a cópia antiga do jogo
  // (guardada pelo service worker até a próxima atualização) não sabe mostrar as peças que aparecem e ficaria travado.
  const fila = withFila === true && FILEIRA_ON && pr.pieces >= fileira.FILA_MIN_PIECES;
  const bw = fila ? FILEIRA_BW : pr.bw;
  const tile = bw / pr.cols;                            // peça no tamanho cheio (no tabuleiro)
  const boardH = pr.rows * tile;
  const t = fila ? Math.round(Math.min(FILEIRA_T_MAX, tile)) : pr.t;      // peça pequena (na bandeja / na fileira)
  const perRow = fila ? fileira.FILA_SLOTS : Math.max(1, Math.floor(FIELD_W / (t * 1.04)));
  const trayRows = fila ? 1 : Math.ceil(pr.pieces / perRow);
  const rowGap = 10;
  const trayTop = BOARD_Y + boardH + 40;
  const extra = fila ? {
    FILA: {
      slots: Array.from({ length: fileira.FILA_SLOTS }, (_, k) => ({ x: Math.round((k + 0.5) * (FIELD_W / fileira.FILA_SLOTS)), y: Math.round(trayTop + t / 2) })),
      soltas: fileira.FILA_SOLTAS
    }
  } : {};
  return Object.assign({
    PIECES: pr.pieces,
    COLS: pr.cols,
    ROWS: pr.rows,
    TILE: tile,
    TRAY: t,
    FIELD_W,
    FIELD_H: Math.round(trayTop + trayRows * t + (trayRows - 1) * rowGap + 25),
    BOARD_W: bw,
    BOARD_H: boardH,
    BOARD_X: Math.round((FIELD_W - bw) / 2),
    BOARD_Y,
    TRAY_LINE: BOARD_Y + boardH + 20,                   // abaixo desta linha a peça solta fica pequena
    SNAP: Math.round(tile * snapFactorFor(pr)),         // distância (entre centros) para a peça encaixar (ímã; mais forte nas quantidades grandes)
    IMA: pr.ima > 1 ? pr.ima : 1,                       // multiplicador do ímã (também o ímã ao arrastar, magnet.js)
    MAX_ROT,
    HINTS: hintsFor(pr),
    HINTS_INF: pr.lampadaLivre === true,                // lâmpada sem limite (quantidades grandes)
    SPOTS: spotsFor(pr),
    TRAY_TOP: trayTop,
    PER_ROW: perRow,
    TRAY_ROWS: trayRows,
    ROW_GAP: rowGap
  }, extra);
}



/* ---------- Servidor HTTP ---------- */
const app = express();
app.set('trust proxy', 1);              // atrás do Render: protocolo (https) e host vêm do proxy
// SEC-10: req.ip passa a ser o IP real do celular também atrás do Cloudflare (ver security.clientIp). Vale para TODOS os limites por endereço
// (login, criação de perfil, envios, salas). Sem Cloudflare na frente, é exatamente o que o "trust proxy" já dava (o último endereço).
Object.defineProperty(app.request, 'ip', { configurable: true, enumerable: true, get() { return security.clientIp(this.headers, this.socket && this.socket.remoteAddress); } });
app.disable('x-powered-by');
app.use(security.securityHeaders);       // cabeçalhos em todas as respostas
app.use(protection.httpMiddleware);      // limites de abuso por IP e concorrência
app.post('/api/csp-report', ...security.cspReportHandler(express));
// A caixa de códigos de teste existe apenas na memória, sem qualquer rota HTTP de leitura.
app.disable('x-powered-by');

app.get('/health', (req, res) => res.type('text').send('ok'));

// /api/config com o catálogo de centenas de imagens passa de 100 KB: comprime com o zlib do próprio Node (sem dependência nova) e guarda o
// resultado comprimido enquanto o conteúdo for o mesmo (a configuração só muda quando o catálogo muda).
const zlib = require('zlib');
let configGz = { body: '', gz: null };
app.get('/api/config', (req, res) => {
  res.set({ 'Cache-Control': 'no-cache', 'Vary': 'Accept-Encoding' });
  const body = JSON.stringify({ images: listImages().filter(i => !i.categoryId), library: library.catalog(), presets: PRESETS, defaultPieces: DEFAULT_PIECES, hints: HINTS, spots: SPOTS, maxName: MAX_NAME, avatars: AVATARS, push: PUSH_PUBLIC ? { key: PUSH_PUBLIC } : null, duel: challenge.config, codeLen: CODE_LEN, shop: shopCatalog.catalog(), accounts: { enabled: !!accounts } });
  res.type('application/json');
  if (body.length > 1024 && /\bgzip\b/i.test(req.get('accept-encoding') || '')) {
    if (configGz.body !== body) configGz = { body, gz: zlib.gzipSync(body) };
    res.set('Content-Encoding', 'gzip');
    return res.send(configGz.gz);
  }
  res.send(body);
});

// Verificação do aplicativo Android (APK).
// O Android só abre o aplicativo em tela cheia (sem a barra do Chrome) se encontrar, neste endereço,
// um arquivo com o nome do pacote e a impressão digital da assinatura: /.well-known/assetlinks.json
// O servidor procura o conteúdo, nesta ordem:
//   1) variável de ambiente ASSETLINKS_JSON (Render > Environment), sem precisar mexer no GitHub;
//   2) public/assetlinks.json   3) public/.well-known/assetlinks.json
//   4) assetlinks.json na raiz  5) .well-known/assetlinks.json na raiz
// Vale o primeiro que tiver conteúdo (um arquivo "[]" vazio é ignorado).
const ASSETLINKS_FILES = [
  path.join(PUBLIC_DIR, 'assetlinks.json'),
  path.join(PUBLIC_DIR, '.well-known', 'assetlinks.json'),
  path.join(__dirname, 'assetlinks.json'),
  path.join(__dirname, '.well-known', 'assetlinks.json')
];

function loadAssetLinks() {
  const env = process.env.ASSETLINKS_JSON;
  if (env && env.trim()) {
    try {
      const j = JSON.parse(env.trim().replace(/^\uFEFF/, ''));
      if (Array.isArray(j) && j.length) return { fonte: 'variável de ambiente ASSETLINKS_JSON', dados: j };
    } catch (e) {
      console.warn('ASSETLINKS_JSON não é um JSON válido; ignorando.');
    }
  }
  for (const f of ASSETLINKS_FILES) {
    try {
      const j = JSON.parse(fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, ''));
      if (Array.isArray(j) && j.length) return { fonte: 'arquivo ' + path.relative(__dirname, f), dados: j };
    } catch (e) { /* tenta o próximo */ }
  }
  return { fonte: 'nenhuma (nada publicado ainda)', dados: [] };
}

app.get('/.well-known/assetlinks.json', (req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.json(loadAssetLinks().dados);
});

// Página de conferência. O essencial (o que o servidor publica para o Android, que já é público em /.well-known) aparece para todos;
// o DETALHE (e-mail, limites, CSP, contas) só com o DIAG_TOKEN do Render, no cabeçalho Authorization: Bearer ou em ?token=
const diagGate = security.createDiagGate(process.env);
if (diagGate.tooShort) console.warn('[diagnostico] DIAG_TOKEN tem menos de 24 caracteres: ignorado. Use um valor longo e aleatório.');
else if (!diagGate.enabled) console.log('[diagnostico] detalhes DESLIGADOS (defina DIAG_TOKEN no Render para vê-los).');
app.get('/diagnostico', (req, res) => {
  res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' });
  const acesso = diagGate.check(req);
  if (acesso === 'limitado') return res.status(429).json({ servidor: 'ok', erro: 'muitas tentativas erradas; espere alguns minutos' });
  const al = loadAssetLinks();
  const pacotes = [];
  for (const st of al.dados) {
    const t = st && st.target;
    if (t && t.namespace === 'android_app') pacotes.push({ pacote: t.package_name, impressoes_digitais: t.sha256_cert_fingerprints || [] });
  }
  if (acesso !== 'ok') {
    return res.json({
      servidor: 'ok',
      verificacao_do_aplicativo: { publicado_em: '/.well-known/assetlinks.json', pacotes },
      detalhes: diagGate.enabled ? 'protegidos: acrescente ?token=SEU_TOKEN' : 'desligados: defina DIAG_TOKEN (24 caracteres ou mais) no Render para vê-los'
    });
  }
  res.json({
    servidor: 'ok',
    verificacao_do_aplicativo: {
      publicado_em: '/.well-known/assetlinks.json',
      encontrado_em: al.fonte,
      pacotes
    },
    imagens: listImages().length,
    encaixe: { raio_em_casas: SNAP_FACTOR, padrao: SNAP_FACTOR_DEFAULT, origem: SNAP_FACTOR === SNAP_FACTOR_DEFAULT ? 'padrão' : 'variável SNAP_FACTOR', puxa_ao_arrastar: magnet.ENABLED, ao_arrastar: { raio_em_casas: magnet.DRAG_FACTOR, espera_ms: magnet.DWELL_MS } },   // o ímã: a peça encaixa a até esta fração da casa
    seguranca: {
      cabecalhos: 'ativos (HSTS, nosniff, anti-clickjacking, Referrer-Policy, Permissions-Policy)',
      email_estado: mailer ? mailer.stats : null,      // envios desde que o servidor ligou e o ÚLTIMO erro (já sem chave, e-mails e IPs)
      csp: { modo: security.CSP_MODE, violacoes_registradas: security.cspStats.total, por_regra: security.cspStats.porRegra, ultimas: security.cspStats.ultimas },
      ip_real: security.ipShape(req.headers),          // SEC-10: só a FORMA da cadeia de proxies deste pedido (nenhum endereço)
      eventos_invalidos_ignorados: protection.handlerErrors(),      // SEC-11: eventos de socket com dados malformados que antes derrubariam o servidor
      promessas_sem_tratamento: rejeicoesSemTratamento,
      tamanho_do_codigo_da_sala: CODE_LEN,
      limite_de_tentativas: joinGuard.limits,          // palpites de código de sala: MAX/DAILY por aparelho, IP_MAX/IP_DAILY por endereço
      limites_por_endereco: protection.limits,        // conexões, criação de salas e pedidos por endereço (números em vigor; nenhum endereço)
      email: mailer ? 'configurado (' + mailer.provider + ')' : 'não configurado' + (mailInfo.missing.length ? ' — faltam as variáveis: ' + mailInfo.missing.join(', ') : (mailInfo.badEmail ? ' — BREVO_SENDER_EMAIL parece inválido' : '')) + ' (sem confirmação de e-mail nem recuperação de senha)'
    },
    contas: {
      ativas: !!accounts,
      banco_configurado: !!DATABASE_URL,
      login_por_codigo_chave: !!accounts,
      avisos_de_denuncia_por_email: accounts && accounts.reportMailInfo ? accounts.reportMailInfo() : { ligado: false },      // destino já mascarado (a***@dominio)
      dica: accounts ? 'Contas funcionando.' : (DATABASE_URL ? 'DATABASE_URL existe, mas o banco não respondeu: veja os registros (logs) do Render.' : 'Contas desligadas: crie um banco PostgreSQL e coloque o endereço na variável DATABASE_URL (veja o guia).')
    }
  });
});

app.set('trust proxy', 1);              // atrás do Render: pega o IP real (para limitar os envios de imagem e as tentativas de entrar em salas)

// O jogo NÃO aceita mais imagens enviadas pelos jogadores (privacidade: ninguém guarda a foto de ninguém; o jogo não é indicado para menores de 16 anos). As rotas antigas respondem 410 (Gone), para que
// um aplicativo antigo, em cache, falhe com clareza em vez de guardar a foto de alguém.
app.all('/api/upload', (req, res) => { res.set('Cache-Control', 'no-store'); res.status(410).json({ ok: false, error: 'gone' }); });
app.all('/api/up/:token', (req, res) => { res.set('Cache-Control', 'no-store'); res.status(410).type('text').send('removido'); });

// Anúncios recompensados (ads.js): DESLIGADOS por padrão. A política de privacidade traz o trecho sobre anúncios SÓ quando a chave está ligada,
// e o /ads.txt só existe com ADS_MODO=teste/real e um ADS_CLIENT válido.
const ADS = require('./ads').fromEnv(process.env);
if (ADS.aviso) console.warn('[anúncios]', ADS.aviso);
else if (ADS.ligado) console.log('[anúncios] modo ' + ADS.modo + ', ' + ADS.gemas + ' gemas por anúncio, até ' + ADS.limite + ' por dia');
const privacyPages = new Map();
app.get('/privacidade.html', (req, res, next) => {
  fs.readFile(path.join(PUBLIC_DIR, 'privacidade.html'), 'utf8', (err, html) => {
    if (err) return next();
    if (!privacyPages.has(html)) { privacyPages.clear(); privacyPages.set(html, require('./ads').privacyHtml(html, ADS.ligado)); }
    res.set('Cache-Control', 'no-cache');
    res.type('html').send(privacyPages.get(html));
  });
});
app.get('/ads.txt', (req, res) => {
  const txt = require('./ads').adsTxt(ADS);
  if (!txt) return res.status(404).type('text').send('');
  res.set('Cache-Control', 'public, max-age=3600'); res.type('text').send(txt);
});

app.use(
  express.static(PUBLIC_DIR, {
    maxAge: '1d',
    setHeaders(res, filePath) {
      if (/\.(html|js|css|webmanifest)$/i.test(filePath)) res.setHeader('Cache-Control', 'no-cache');
    }
  })
);

const server = http.createServer(app);
// Guard against slow/incomplete HTTP headers and request bodies, without changing WebSocket heartbeats.
server.headersTimeout = 15000;
server.requestTimeout = 30000;
server.maxRequestsPerSocket = 500;
const io = new Server(server, {
  pingInterval: 10000,
  pingTimeout: 15000,
  maxHttpBufferSize: 1e5,
  allowRequest: (req, callback) => callback(null, protection.sameOrigin(req))
});
protection.installSocketShield(io);

/* ---------- Imagens ---------- */
const SMALL_WORDS = new Set(['e', 'de', 'do', 'da', 'dos', 'das', 'a', 'o', 'com']);
function prettyName(file) {
  const base = file.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').replace(/([A-Za-zÀ-ÿ])(\d)/g, '$1 $2').trim();
  if (!base) return file;
  return base
    .split(/\s+/)
    .map((w, i) => (i > 0 && SMALL_WORDS.has(w.toLowerCase()) ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

function cleanAvatar(a) {
  return AVATARS.includes(a) ? a : '';
}

function cleanName(n) {
  return String(n == null ? '' : n)
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NAME);
}

// Arquivo opcional public/imagens/nomes.json: { "arquivo.jpg": "Nome bonito, com acento", ... }
// Os nomes dão o rótulo na escolha da imagem e a ordem das imagens listadas; as que não estão nele vêm antes, em ordem alfabética.
function readImageNames() {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(IMG_DIR, 'nomes.json'), 'utf8'));
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  } catch (e) {
    return {};
  }
}

function listImages() {
  try {
    const names = readImageNames();
    const order = Object.keys(names);
    const old = fs
      .readdirSync(IMG_DIR)
      .filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
      .sort((a, b) => {
        const ia = order.indexOf(a), ib = order.indexOf(b);
        if (ia < 0 && ib < 0) return a.localeCompare(b, 'pt', { numeric: true });
        if (ia < 0) return -1;
        if (ib < 0) return 1;
        return ia - ib;
      })
      .slice(0, MAX_IMAGES)
      .map((f) => {
        const nice = typeof names[f] === 'string' ? names[f].replace(/\s+/g, ' ').trim().slice(0, 30) : '';
        // miniatura pronta (300×400) em imagens/mini/: a galeria abre bem mais leve. Sem ela, o celular gera a miniatura.
        const mini = fs.existsSync(path.join(IMG_DIR, 'mini', f)) ? 'imagens/mini/' + encodeURIComponent(f) : null;
        return { file: f, url: 'imagens/' + encodeURIComponent(f), thumb: mini, label: nice || prettyName(f) };
      });
    return old.concat(library.assets());
  } catch (e) {
    return library.assets();
  }
}

/* ---------- Imagens do jogo ----------
 * Só existem imagens do catálogo (a biblioteca e as clássicas). Qualquer outro identificador (inclusive os antigos "custom:...")
 * cai na primeira imagem da lista: o servidor nunca guarda nem entrega imagem de jogador. */
function validImage(file) {
  const list = listImages();
  if (!list.length) return null;
  const found = list.find((i) => i.file === file);
  return (found || list[0]).file;
}

/* ---------- Salas ---------- */
const rooms = new Map();

function newCode() {
  for (let t = 0; t < 100; t++) {
    let c = '';
    for (let i = 0; i < CODE_LEN; i++) c += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
    if (!rooms.has(c) && !(challenge && challenge.has(c))) return c;     // o código é único entre salas comuns e Salas Desafio
  }
  return null;
}

function rnd(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function clamp(v, min, max) {
  v = asNum(v);
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}

function buildPieces(cfg, readyToFit = false) {
  const total = cfg.COLS * cfg.ROWS;
  // posições da bandeja (embaixo do tabuleiro), espalhadas na largura toda
  const slots = [];
  const colW = cfg.FIELD_W / cfg.PER_ROW;
  for (let r = 0; r < cfg.TRAY_ROWS; r++) {
    for (let c = 0; c < cfg.PER_ROW; c++) {
      slots.push({
        x: Math.round((c + 0.5) * colW),
        y: Math.round(cfg.TRAY_TOP + r * (cfg.TRAY + cfg.ROW_GAP) + cfg.TRAY / 2)
      });
    }
  }
  shuffle(slots);
  const jit = Math.max(3, Math.round(cfg.TRAY * 0.05));
  const half = Math.ceil(cfg.TRAY / 2);   // limites inteiros (evita meio ponto)
  const pieces = [];
  for (let id = 0; id < total; id++) {
    const sl = slots[id % slots.length];          // fileira de 5: só há 5 vagas (fila.init guarda as outras peças logo depois)
    pieces.push({
      id,
      col: id % cfg.COLS,
      row: Math.floor(id / cfg.COLS),
      x: clamp(sl.x + rnd(-jit, jit), half, cfg.FIELD_W - half),
      y: clamp(sl.y + rnd(-jit, jit), half, cfg.FIELD_H - half),
      rot: readyToFit ? 0 : rnd(0, 3), // Solo/Coop: prontas; Desafio: giros aleatórios
      rotUsed: 0,
      heldBy: null,     // índice do jogador que está segurando
      locked: false,
      lockedBy: null,
      z: 10 + id
    });
  }
  return pieces;
}

function createRoom(code, imageId, pieces, solo, withFila) {
  const now = Date.now();
  const cfg = layoutFor(pieces, withFila === true);
  const room = {
    code,
    solo: solo === true,          // modo Solo: sala de 1 pessoa (sem amigo, sem bate-papo, sem progresso salvo)
    imageId,
    cfg,
    hints: [cfg.HINTS, cfg.HINTS],
    spots: [cfg.SPOTS, cfg.SPOTS],
    rematch: null,
    imgReady: [false, false],   // cada celular avisa quando a imagem está carregada e preparada
    status: 'waiting', // waiting | playing | won
    createdAt: now,
    lastActive: now,
    roundStart: now,
    startedAt: null,
    finishedAt: null,
    z: 100,
    pieces: buildPieces(cfg, true),
    players: [null, null] // { pid, socketId, connected, name }
  };
  fileira.init(cfg, room.pieces);          // 20, 30 e 48 peças: só 5 à vista na fileira; nas outras não muda nada
  return room;
}

function connectedCount(room) {
  return room.players.filter((p) => p && p.connected).length;
}

function elapsed(room) {
  if (!room.startedAt) return 0;
  return (room.finishedAt || Date.now()) - room.startedAt;
}

function counts(room) {
  const c = [0, 0];
  for (const p of room.pieces) if (p.locked && (p.lockedBy === 0 || p.lockedBy === 1)) c[p.lockedBy]++;
  return c;
}

function lockedTotal(room) {
  return room.pieces.reduce((n, p) => n + (p.locked ? 1 : 0), 0);
}

function playersInfo(room) {
  return room.players.map((p, idx) => ({ idx, joined: !!p, connected: !!(p && p.connected), name: p ? p.name : '', avatar: p ? p.avatar || '' : '', level: p ? p.level || 0 : 0 }));
}

function meta(room) {
  return {
    status: room.status,
    players: playersInfo(room),
    elapsedMs: elapsed(room),
    counts: counts(room),
    locked: lockedTotal(room),
    total: room.pieces.length,
    hints: room.hints,
    spots: room.spots,
    loading: isCustomImage(room) && room.status === 'waiting' && connectedCount(room) === seatsNeeded(room) && !imagesReady(room),
    solo: room.solo === true
  };
}

function snapshot(room) {
  return Object.assign(
    {
      code: room.code,
      imageId: room.imageId,
      cfg: room.cfg,
      pieces: room.pieces.map((p) => ({
        id: p.id,
        col: p.col,
        row: p.row,
        x: Math.round(p.x),
        y: Math.round(p.y),
        rot: p.rot,
        rotUsed: p.rotUsed,
        heldBy: p.heldBy,
        locked: p.locked,
        lockedBy: p.lockedBy,
        z: p.z,
        out: p.out !== false                    // false = ainda guardada (fileira de 5): o celular não mostra nem deixa pegar
      }))
    },
    meta(room)
  );
}

function broadcastMeta(room) {
  io.to(room.code).emit('meta', meta(room));
}

function isCustomImage() { return false; }       // imagens enviadas por jogadores foram removidas (LGPD): nenhuma sala espera a imagem de um celular

// quantas pessoas precisam estar conectadas para a partida começar (Solo: 1; cooperativo: 2)
function seatsNeeded(room) { return room.solo ? 1 : 2; }
// imagem própria: espera o celular de cada pessoa da sala (Solo: só o do dono)
function imagesReady(room) {
  if (!isCustomImage(room)) return true;
  return room.solo ? !!room.imgReady[0] : !!(room.imgReady[0] && room.imgReady[1]);
}

function startIfReady(room) {
  if (room.status === 'waiting' && connectedCount(room) === seatsNeeded(room) && imagesReady(room)) {
    room.status = 'playing';
    if (!room.startedAt) room.startedAt = Date.now() - (room.carriedMs || 0);     // partida retomada: continua de onde o tempo parou
  }
}

function releaseHeldBy(room, idx, exceptId) {
  for (const p of room.pieces) {
    if (p.heldBy === idx && p.id !== exceptId) {
      p.heldBy = null;
      p.rotUsed = 0; // sem limite de giros: contador legado sempre reinicia ao soltar
      io.to(room.code).emit('released', { id: p.id, by: idx, x: Math.round(p.x), y: Math.round(p.y), rotUsed: p.rotUsed });
    }
  }
}

// tenta encaixar a peça; devolve true se travou
function tryLock(room, p, idx) {
  const cfg = room.cfg;
  const tx = cfg.BOARD_X + p.col * cfg.TILE + cfg.TILE / 2;
  const ty = cfg.BOARD_Y + p.row * cfg.TILE + cfg.TILE / 2;
  if (p.rot !== 0) return false;
  if (Math.hypot(p.x - tx, p.y - ty) > cfg.SNAP) return false;

  p.x = tx;
  p.y = ty;
  p.locked = true;
  p.lockedBy = idx;
  p.heldBy = null;
  p.z = 1;
  io.to(room.code).emit('locked', { id: p.id, x: tx, y: ty, by: idx, counts: counts(room), locked: lockedTotal(room) });
  if (accounts && !room.solo) accounts.noteCoop(room);      // progresso salvo (com um pequeno atraso, sem pesar); o Solo nunca grava
  revealFila(room);                                         // fileira de 5: a vaga que ficou livre ganha a próxima peça

  if (lockedTotal(room) === room.pieces.length) {
    room.status = 'won';
    if (!room.startedAt) room.startedAt = room.roundStart;
    room.finishedAt = Date.now();
    io.to(room.code).emit('won', { elapsedMs: elapsed(room), counts: counts(room) });
    broadcastMeta(room);
    if (accounts) accounts.finishCoop(room).catch(() => {});  // vira histórico e apaga o progresso salvo
  }
  return true;
}

// o celular tem o jogo novo, que sabe mostrar a fileira de 5? (ele avisa ao conectar: io({ auth: { fila: 1 } }) no game.js)
function filaClient(socketOrId) {
  const s = typeof socketOrId === 'string' ? io.sockets.sockets.get(socketOrId) : socketOrId;
  return !!(s && s.handshake && s.handshake.auth && s.handshake.auth.fila === 1);
}
function filaRoomOk(room) {
  return room.players.every((pl) => !pl || !pl.connected || filaClient(pl.socketId));
}

// FILEIRA DE 5: mostra as peças que cabem agora (o servidor decide quais e quando) e avisa os dois celulares
function revealFila(room) {
  const novas = fileira.refill(room.cfg, room.pieces, () => ++room.z);
  if (!novas.length) return novas;
  io.to(room.code).emit('fila', { pieces: novas });
  // celular com a cópia antiga do jogo que entrou numa sala com fileira: ele não conhece 'fila', então recebe o tabuleiro inteiro de novo
  room.players.forEach((pl, i) => { if (pl && pl.connected && !filaClient(pl.socketId)) emitToPlayer(room, i, 'state', snapshot(room)); });
  return novas;
}

function ctx(socket) {
  const code = socket.data.code;
  if (!code) return null;
  const room = rooms.get(code);
  if (!room) return null;
  const idx = socket.data.idx;
  const pl = room.players[idx];
  if (!pl || pl.socketId !== socket.id) return null;
  room.lastActive = Date.now();
  return { room, idx };
}

function pieceFrom(room, id) {
  id = asNum(id);
  if (!Number.isInteger(id) || id < 0 || id >= room.pieces.length) return null;
  return room.pieces[id];
}

function room_player(c) {
  return c.room.players[c.idx];
}

function reply(cb, data) {
  if (typeof cb === 'function') cb(data);
}

function cleanPid(pid) {
  return typeof pid === 'string' && pid.length >= 6 && pid.length <= 64 ? pid : null;
}

// coloca o socket dentro da sala (novo jogador ou reconexão).
// VAGA RESERVADA (decisão do proprietário, 14/11/2026; auditoria SEC-04): quem CAIU (internet, app fechado sem querer) continua dono
// da vaga até o fim da partida; antes, qualquer pessoa com o código tomava a vaga de quem caiu, mesmo no meio da partida.
// Quem SAIU de propósito (botão Sair) não volta, e a sala FECHA: o código não serve mais para ninguém entrar; quem ficou termina sozinho.
function attach(room, socket, pid, name, avatar) {
  let idx = room.players.findIndex((p) => p && p.pid === pid);
  if (idx !== -1 && room.players[idx].left) return { error: 'closed' };        // saiu pelo botão Sair: não volta
  if (idx === -1) {
    if (room.closed) return { error: 'closed' };                                  // alguém saiu de propósito: o código não vale mais
    idx = room.players.findIndex((p) => !p);                                      // só vaga NUNCA ocupada
    if (idx === -1) return { error: 'full' };                                     // a vaga de quem caiu continua reservada para ele
  }
  const old = room.players[idx];
  if (old && old.connected && old.socketId && old.socketId !== socket.id) {
    const oldSocket = io.sockets.sockets.get(old.socketId);
    if (oldSocket) {
      oldSocket.data.code = null;
      oldSocket.leave(room.code);
    }
  }
  const same = !!(old && old.pid === pid);
  const prevName = same ? old.name : '';
  const prevAvatar = same ? old.avatar : '';
  room.players[idx] = {
    pid,
    socketId: socket.id,
    connected: true,
    name: 'Jogador ' + (idx + 1),             // nomes e apelidos do perfil NUNCA circulam entre jogadores
    avatar: cleanAvatar(avatar) || prevAvatar || '',
    uid: socket.data.uid || null,           // conta do jogador (null = visitante)
    level: roomLevel(socket.data.uid),        // sempre 0: o nível do perfil NÃO circula na sala (política de privacidade); o campo continua por compatibilidade
    push: same ? old.push || null : null,
    lastPush: 0
  };
  socket.data.code = room.code;
  socket.data.idx = idx;
  socket.join(room.code);
  room.lastActive = Date.now();
  room.imgReady[idx] = false;           // quem entra (ou volta) precisa avisar de novo que a imagem está pronta
  startIfReady(room);
  return { idx, isNew: !same };
}

function emitToPlayer(room, idx, ev, data) {
  const p = room.players[idx];
  if (p && p.connected && p.socketId) io.to(p.socketId).emit(ev, data);
}

function clearRematch(room) {
  if (room.rematch) {
    clearTimeout(room.rematch.timer);
    room.rematch = null;
  }
}

function expireRematch(room) {
  if (!room.rematch) return;
  room.rematch = null;
  io.to(room.code).emit('rematch', { state: 'expired' });
}

// recomeça a partida (mesma sala e mesmos jogadores; a conversa continua)
function performRestart(room, params) {
  clearRematch(room);
  room.imageId = params.imageId;
  room.cfg = layoutFor(params.pieces, filaRoomOk(room));
  room.pieces = buildPieces(room.cfg, true);
  fileira.init(room.cfg, room.pieces);
  room.hints = [room.cfg.HINTS, room.cfg.HINTS];
  room.spots = [room.cfg.SPOTS, room.cfg.SPOTS];
  room.z = 100;
  room.finishedAt = null;
  room.roundStart = Date.now();
  room.startedAt = null;
  room.carriedMs = 0;
  room.status = 'waiting';
  room.imgReady = [false, false];
  if (accounts && !room.solo) for (const p of room.players) if (p && p.uid && !p.left) accounts.deleteSave(p.uid).catch(() => {});   // recomeçou: o progresso antigo não vale mais (o Solo nunca apaga o progresso do cooperativo)
  startIfReady(room);
  io.to(room.code).emit('state', snapshot(room));
}

// aviso para quem está com o aplicativo fechado (só se a pessoa ativou os avisos)
function sendPush(room, idx, payload) {
  const pl = room.players[idx];
  if (!webpush || !pl || !pl.push || pl.connected) return;
  const now = Date.now();
  pl.lastPush = now;
  webpush
    .sendNotification(pl.push, JSON.stringify(payload), { TTL: 600, urgency: 'high' })
    .catch((err) => {
      if (err && (err.statusCode === 404 || err.statusCode === 410)) pl.push = null;   // aviso desfeito no aparelho
    });
}

// explicit = a pessoa saiu de propósito (botão Sair, foi para outra sala). Sem explicit = caiu (internet, app fechado): vaga reservada.
// explicit = saiu DE PROPÓSITO (botão Sair, criar/entrar em outra sala). Devolve a promessa da limpeza do "Continuar jogando" (ou null).
function leaveCurrent(socket, explicit, opts) {
  const code = socket.data.code;
  if (!code) return null;
  const room = rooms.get(code);
  socket.data.code = null;
  socket.leave(code);
  if (!room) return null;
  let limpeza = null;
  const idx = socket.data.idx;
  const pl = room.players[idx];
  if (pl && pl.socketId === socket.id) {
    pl.connected = false;
    pl.socketId = null;
    if (explicit === true && !room.solo) { pl.left = true; room.closed = true; }   // cooperativo: saiu de propósito → a sala fecha para novos
    releaseHeldBy(room, idx, -1);
    if (room.rematch) {                       // quem sai cancela o pedido de recomeçar
      clearRematch(room);
      emitToPlayer(room, 1 - idx, 'rematch', { state: 'expired' });
    }
    room.lastActive = Date.now();
    // "Continuar jogando" (16/11/2026, pedido do proprietário): quem SAI PELO BOTÃO encerrou a partida para si: o progresso salvo DESTA sala
    // é apagado e não volta (noteCoop pula quem saiu). Quem só caiu ou fechou o aplicativo sem querer continua com o "Continuar jogando".
    if (accounts && !room.solo && explicit === true && pl.uid && !(opts && opts.keepSave) && room.savedFor && room.savedFor.has(pl.uid)) {
      room.savedFor.delete(pl.uid);
      limpeza = accounts.deleteSave(pl.uid).catch((e) => console.error('[contas] apagar salvo ao sair:', e.message));
    }
    if (accounts && !room.solo) accounts.noteCoop(room, true);
    broadcastMeta(room);
  }
  return limpeza;
}

const accHooks = { duelFinish: null, levelOf: null };
// Nível mostrado DENTRO das salas (cooperativo e Sala Desafio): sempre 0. A política de privacidade promete que a outra pessoa vê só
// "Jogador 1/2", nunca apelido, ID, nível, gemas, pet ou roupas. O campo `level` continua nos eventos (contrato e aplicativo antigo em cache).
function roomLevel() { return 0; }

/* ---------- Sala Desafio (módulo separado: salas, tabuleiros e eventos "ch:" próprios) ---------- */
const challenge = require('./challenge')({
  io, PRESETS, DEFAULT_PIECES, SNAP_FACTOR, snapFactorFor, FIELD_W, BOARD_Y, MAX_ROT, HINTS, SPOTS, HINTS_SEM_LIMITE,
  validImage, validPieces, cleanName, cleanAvatar, cleanPid, newCode, layoutFor, buildPieces, filaClient,
  sendPush, validPushSub, webpush, clamp, rnd, shuffle,
  levelOf: roomLevel,                                                                                 // nível mostrado na Sala Desafio: sempre 0 (privacidade)
  onFinish: (room, result) => (accHooks.duelFinish ? accHooks.duelFinish(room, result) : null),      // histórico das disputas (só com contas ativas)
  joinLocked, joinMiss, blockedWithRoom, codeLen: CODE_LEN,
  allowRoom: socket => protection.allowRoom(socket, rooms.size + challenge.size()),
  imageAllowed: async (socket, file) => !library.image(file) || (accounts ? accounts.libraryCanPlay(socket.data.uid, file) : !library.cat(library.image(file).categoryId).price)
});

// limite de tentativas de adivinhar o código da sala: conta por APARELHO (o perfil, se logado; senão, a conexão) e, com limite bem maior, por ENDEREÇO (ver security.createJoinGuard)
function joinDev(socket) { return socket.data.uid ? 'u:' + socket.data.uid : 's:' + socket.id; }
function joinLocked(socket) { return joinGuard.check(security.ipOfSocket(socket), joinDev(socket)); }
function joinMiss(socket, code) {
  if (rooms.has(code) || (challenge && challenge.has(code))) return joinLocked(socket);   // existe: não é palpite errado
  return joinGuard.fail(security.ipOfSocket(socket), code, joinDev(socket));
}
function blockedWithRoom(socket, players) {
  const uid = socket.data.uid;
  return !!(accounts && uid && (players || []).some((p) => p && p.uid && accounts.blockedBetween(uid, p.uid)));
}
// a outra pessoa da sala em que este celular está (para "bloquear jogador")
function peerOf(socket) {
  const room = socket.data.code && rooms.get(socket.data.code);
  if (room) { const o = room.players[1 - socket.data.idx]; return o ? { uid: o.uid || null, name: o.name } : null; }
  return challenge.peerOf(socket);
}

/* ---------- Contas, amigos, convites e progresso salvo (só ligam se DATABASE_URL estiver configurada) ---------- */
const DATABASE_URL = process.env.DATABASE_URL || '';
let accounts = null;                                     // continua nulo sem banco: o jogo funciona como sempre (visitante)

function imageLabel(id) {
  const it = listImages().find((i) => i.file === id);
  return it ? it.label : String(id || '');
}
// resumo de uma sala (comum ou desafio) para o sistema de convites
function roomInfo(code) {
  const r = rooms.get(code);
  if (r) return { code, kind: 'coop', free: r.status !== 'won' && !r.closed && r.players.some((p) => !p), hostConnected: connectedCount(r) > 0, imageId: r.imageId, pieces: r.pieces.length };
  return challenge.info(code);
}
function roomOfSocket(socket) {
  if (socket.data.code && rooms.get(socket.data.code)) return roomInfo(socket.data.code);
  return socket.data.ch ? challenge.info(socket.data.ch.code) : null;
}
// quando alguém entra/sai da conta com a sala aberta, a sala passa a saber quem é (para salvar e registrar a partida)
function bindUserToRooms(socket, uid) {
  const room = socket.data.code && rooms.get(socket.data.code);
  if (room) {
    const pl = room.players[socket.data.idx];
    if (pl && pl.socketId === socket.id) {
      pl.uid = uid || null;
      const lv = roomLevel(uid);                                                              // sempre 0 (o nível não circula na sala)
      if (lv !== pl.level) { pl.level = lv; io.to(room.code).emit('meta', meta(room)); }      // o login terminou DEPOIS de entrar na sala: avisa os outros do nível
    }
  }
  challenge.bindUser(socket, uid);
}
/* ---------- Eventos do Socket.IO ---------- */
io.on('connection', (socket) => {
  socket.data.lastMove = 0;

  socket.on('create', async (data, cb) => {
    data = data || {};
    const pid = cleanPid(data.pid);
    if (!pid) return reply(cb, { ok: false, error: 'invalid' });
    const imageId = validImage(data.imageId);
    if (!imageId) return reply(cb, { ok: false, error: 'noimages' });
    try {
      if (library.image(imageId) && !(accounts ? await accounts.libraryCanPlay(socket.data.uid, imageId) : !library.cat(library.image(imageId).categoryId).price))
        return reply(cb, { ok: false, error: 'library_locked' });
    } catch (e) { return reply(cb, { ok: false, error: 'server' }); }
    if (!protection.allowRoom(socket, rooms.size + challenge.size())) return reply(cb, { ok: false, error: 'busy' });
    const code = newCode();
    if (!code) return reply(cb, { ok: false, error: 'busy' });

    leaveCurrent(socket, true);                                   // criar outra sala = sair da atual de propósito
    const room = createRoom(code, imageId, validPieces(data.pieces, DEFAULT_PIECES), data.solo === true, filaClient(socket));
    rooms.set(code, room);
    const res = attach(room, socket, pid, data.name, data.avatar);
    reply(cb, { ok: true, idx: res.idx, snapshot: snapshot(room) });
    broadcastMeta(room);
  });

  // "Continuar jogando": recria a sala com as peças já encaixadas e o tempo que a partida tinha
  socket.on('acc:continue', async (data, cb) => {
    try {
      data = data || {};
      const uid = socket.data.uid;
      if (!accounts || !uid) return reply(cb, { ok: false, error: 'auth' });
      const pid = cleanPid(data.pid);
      if (!pid) return reply(cb, { ok: false, error: 'invalid' });
      const save = await accounts.loadSave(uid);
      if (!save) return reply(cb, { ok: false, error: 'nosave' });
      let imageId = save.imageId;
      if (validImage(imageId) !== imageId) return reply(cb, { ok: false, error: 'imagegone' });          // a imagem não existe mais (inclui progressos antigos com foto própria)
      if (!protection.allowRoom(socket, rooms.size + challenge.size())) return reply(cb, { ok: false, error: 'busy' });
      const code = newCode();
      if (!code) return reply(cb, { ok: false, error: 'busy' });
      leaveCurrent(socket, true, { keepSave: true });      // o salvo que está sendo retomado não pode ser apagado aqui
      const room = createRoom(code, imageId, validPieces(save.pieces, DEFAULT_PIECES), false, filaClient(socket));
      room.carriedMs = save.elapsedMs || 0;
      const ids = new Set((Array.isArray(save.locked) ? save.locked : []).map(Number));
      for (const p of room.pieces) {
        if (!ids.has(p.id)) continue;
        p.x = room.cfg.BOARD_X + p.col * room.cfg.TILE + room.cfg.TILE / 2;
        p.y = room.cfg.BOARD_Y + p.row * room.cfg.TILE + room.cfg.TILE / 2;
        p.rot = 0; p.locked = true; p.lockedBy = 0; p.z = 1; p.out = true;
      }
      fileira.init(room.cfg, room.pieces);          // continuar jogando: a fileira recomeça com 5 das peças que faltam
      room.savedFor = new Set([uid]);               // esta sala É o progresso salvo: sair dela pelo botão apaga o "Continuar jogando"
      rooms.set(code, room);
      const res = attach(room, socket, pid, data.name, data.avatar);
      reply(cb, { ok: true, idx: res.idx, snapshot: snapshot(room) });
      broadcastMeta(room);
    } catch (e) { console.error('[contas] continuar:', e.message); reply(cb, { ok: false, error: 'server' }); }
  });

  socket.on('join', (data, cb) => {
    data = data || {};
    const pid = cleanPid(data.pid);
    const code = asStr(data.code).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LEN);
    if (!pid) return reply(cb, { ok: false, error: 'invalid' });
    const lk = joinLocked(socket);
    if (lk.locked) return reply(cb, { ok: false, error: 'locked', retryMs: lk.retryMs });
    const room = rooms.get(code);
    if (!room) { const m = joinMiss(socket, code); return reply(cb, m.locked ? { ok: false, error: 'locked', retryMs: m.retryMs } : { ok: false, error: 'notfound' }); }
    if (room.solo && !room.players.some((p) => p && p.pid === pid)) {      // sala Solo: só o dono volta; os outros recebem a MESMA resposta de "sala inexistente"
      const m = joinGuard.fail(security.ipOfSocket(socket), code, joinDev(socket));             // e a tentativa conta como palpite errado (joinMiss não contaria, porque a sala existe): sem diferença que revele a sala
      return reply(cb, m.locked ? { ok: false, error: 'locked', retryMs: m.retryMs } : { ok: false, error: 'notfound' });
    }
    if (room.closed && !room.players.some((p) => p && p.pid === pid && !p.left)) {   // alguém saiu de propósito: o código não serve mais (só quem ficou volta)
      const m = joinGuard.fail(security.ipOfSocket(socket), code, joinDev(socket));                     // mesma resposta (e mesma contagem) de código inexistente
      return reply(cb, m.locked ? { ok: false, error: 'locked', retryMs: m.retryMs } : { ok: false, error: 'notfound' });
    }
    if (blockedWithRoom(socket, room.players)) return reply(cb, { ok: false, error: 'notfound' });    // alguém da sala bloqueou esta pessoa

    if (socket.data.code && socket.data.code !== code) leaveCurrent(socket, true);      // entrar em outra sala = sair desta de propósito
    const res = attach(room, socket, pid, data.name, data.avatar);
    if (res.error) return reply(cb, { ok: false, error: res.error });
    reply(cb, { ok: true, idx: res.idx, snapshot: snapshot(room) });
    broadcastMeta(room);
    if (res.isNew) {                          // avisa quem criou a sala (se estiver com o app fechado)
      sendPush(room, 1 - res.idx, { title: 'Quebra-Cabeça a Dois', body: room.players[res.idx].name + ' entrou na sala. Bora jogar?', tag: 'join', url: '/?sala=' + room.code });
    }
  });

  socket.on('grab', (data) => {
    const c = ctx(socket);
    if (!c || !data) return;
    const { room, idx } = c;
    const p = pieceFrom(room, data.id);
    if (!p || room.status === 'won' || p.out === false) return;        // peça ainda guardada (fileira de 5): ninguém pega
    if (p.locked || (p.heldBy !== null && p.heldBy !== idx)) {
      socket.emit('deny', { id: p.id, reason: p.locked ? 'locked' : 'held', by: p.heldBy });
      return;
    }
    releaseHeldBy(room, idx, p.id); // só uma peça por vez
    p.heldBy = idx;
    p.z = ++room.z;
    io.to(room.code).emit('grabbed', { id: p.id, by: idx, z: p.z });
  });

  socket.on('move', (data) => {
    const c = ctx(socket);
    if (!c || !data) return;
    const now = Date.now();
    if (now - socket.data.lastMove < 25) return; // limite de ~40 msgs/s
    socket.data.lastMove = now;
    const p = pieceFrom(c.room, data.id);
    if (!p || p.heldBy !== c.idx) return;
    const hh = Math.ceil(c.room.cfg.TRAY / 2);
    const nx = clamp(data.x, hh, c.room.cfg.FIELD_W - hh), ny = clamp(data.y, hh, c.room.cfg.FIELD_H - hh);
    p.x = nx; p.y = ny;
    // ímã ao ARRASTAR (mais fraco desde 15/11/2026): só puxa se o dedo FICAR perto da casa certa por um instante (ver magnet.js)
    if (magnet.ENABLED) {
      const room = c.room, idx = c.idx;
      if (dragDwell.onMove(room.cfg, p, now, () => p.heldBy === idx && !p.locked && rooms.get(room.code) === room && tryLock(room, p, idx))) return;
    }
    socket.to(c.room.code).emit('moved', { id: p.id, x: Math.round(p.x), y: Math.round(p.y) });      // sem "volatile": com o amigo em polling/rede lenta, o volatile descartava 75–87% das posições
  });

  socket.on('rotate', (data) => {
    const c = ctx(socket);
    if (!c || !data) return;
    const { room, idx } = c;
    const p = pieceFrom(room, data.id);
    if (!p || p.heldBy !== idx || p.locked) return;
    // Compatibilidade com cliente antigo: no Solo/Cooperativo não existe giro.
    // Confirma a orientação correta sem alterar as regras de SNAP ou desafiar a sala.
    p.rot = 0;
    p.rotUsed = 0;
    io.to(room.code).emit('rotated', { id: p.id, rot: 0, rotUsed: 0 });
  });

  // soltar a peça (arrastou e largou, ou tocou de novo para dispensar)
  socket.on('drop', (data) => {
    const c = ctx(socket);
    if (!c || !data) return;
    const { room, idx } = c;
    const p = pieceFrom(room, data.id);
    if (!p || p.heldBy !== idx || p.locked) return;
    dragDwell.cancel(p);                                  // soltou: a espera do ímã ao arrastar acaba aqui (ao soltar vale o raio do tryLock)
    const hh = Math.ceil(room.cfg.TRAY / 2);
    p.x = clamp(data.x, hh, room.cfg.FIELD_W - hh);
    p.y = clamp(data.y, hh, room.cfg.FIELD_H - hh);
    if (tryLock(room, p, idx)) return;
    p.heldBy = null;
    p.rotUsed = 0;
    io.to(room.code).emit('released', { id: p.id, by: idx, x: Math.round(p.x), y: Math.round(p.y), rotUsed: p.rotUsed });
    revealFila(room);                                     // puxou da fileira para a grade (até 3 soltas): a vaga ganha outra peça
  });

  // Recomeçar / trocar imagem ou peças: se o amigo está na sala, ele precisa aceitar (30 s).
  // Sozinho na sala, recomeça na hora.
  socket.on('restart', async (data, cb) => {
    const c = ctx(socket);
    if (!c) return reply(cb, { ok: false });
    const { room, idx } = c;
    const other = 1 - idx;
    const op = room.players[other];
    const params = {
      imageId: validImage(data && data.imageId) || room.imageId,
      pieces: validPieces(data && data.pieces, room.cfg.PIECES)
    };
    try {
      if (library.image(params.imageId) && !(accounts ? await accounts.libraryCanPlay(socket.data.uid, params.imageId) : !library.cat(library.image(params.imageId).categoryId).price))
        return reply(cb, { ok: false, error: 'library_locked' });
    } catch (e) { return reply(cb, { ok: false, error: 'server' }); }
    if (!op || !op.connected) {
      performRestart(room, params);
      return reply(cb, { ok: true, immediate: true });
    }
    if (room.rematch && room.rematch.by !== idx) return reply(cb, { ok: false, error: 'pending' });
    clearRematch(room);
    room.rematch = { by: idx, params, timer: setTimeout(() => expireRematch(room), REMATCH_MS) };
    emitToPlayer(room, other, 'rematch', {
      state: 'request',
      by: idx,
      byName: room.players[idx].name,
      imageId: params.imageId,
      pieces: params.pieces,
      ms: REMATCH_MS
    });
    reply(cb, { ok: true, pending: true });
  });

  socket.on('rematch:answer', (data, cb) => {
    const c = ctx(socket);
    if (!c) return reply(cb, { ok: false });
    const { room, idx } = c;
    const r = room.rematch;
    if (!r || r.by === idx) return reply(cb, { ok: false, error: 'none' });
    if (data && data.accept) {
      performRestart(room, r.params);
      return reply(cb, { ok: true });
    }
    const by = r.by;
    clearRematch(room);
    emitToPlayer(room, by, 'rematch', { state: 'declined', byName: room.players[idx].name });
    reply(cb, { ok: true });
  });

  socket.on('rematch:cancel', (data, cb) => {
    const c = ctx(socket);
    if (!c) return reply(cb, { ok: false });
    const { room, idx } = c;
    if (!room.rematch || room.rematch.by !== idx) return reply(cb, { ok: false, error: 'none' });
    clearRematch(room);
    emitToPlayer(room, 1 - idx, 'rematch', { state: 'cancelled' });
    reply(cb, { ok: true });
  });

  // o celular avisa que a imagem desta sala já está carregada e preparada
  socket.on('imgready', (data, cb) => {
    const c = ctx(socket);
    if (!c) return reply(cb, { ok: false });
    c.room.imgReady[c.idx] = true;
    startIfReady(c.room);
    broadcastMeta(c.room);
    reply(cb, { ok: true });
  });

  socket.on('hint', (data, cb) => {
    const c = ctx(socket);
    if (!c) return reply(cb, { ok: false, left: 0 });
    const { room, idx } = c;
    if (room.hints[idx] <= 0) return reply(cb, { ok: false, left: 0 });
    if (!room.cfg.HINTS_INF) room.hints[idx]--;                 // lâmpada sem limite nas quantidades grandes
    reply(cb, { ok: true, left: room.hints[idx] });
    socket.emit('meta', meta(room));
  });

  // 📍 mostra onde a peça escolhida encaixa: cada jogador tem SPOTS usos por partida (o servidor conta)
  socket.on('spot', (data, cb) => {
    const c = ctx(socket);
    if (!c) return reply(cb, { ok: false, left: 0 });
    const { room, idx } = c;
    const p = pieceFrom(room, data && data.id);
    if (!p || p.locked || p.out === false || room.status === 'won') return reply(cb, { ok: false, error: 'invalid', left: room.spots[idx] });
    if (room.spots[idx] <= 0) return reply(cb, { ok: false, left: 0 });
    room.spots[idx]--;
    reply(cb, { ok: true, left: room.spots[idx], col: p.col, row: p.row });
    socket.emit('meta', meta(room));
  });

  // avisos com o app fechado: o aparelho entrega aqui o "endereço" do aviso dele (só para os serviços conhecidos)
  socket.on('push:subscribe', (data, cb) => {
    const c = ctx(socket);
    if (!c || !webpush) return reply(cb, { ok: false });
    const sub = data && data.sub;
    if (!validPushSub(sub)) return reply(cb, { ok: false, error: 'invalid' });
    room_player(c).push = { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } };
    reply(cb, { ok: true });
  });

  socket.on('push:unsubscribe', (data, cb) => {
    const c = ctx(socket);
    if (!c) return reply(cb, { ok: false });
    room_player(c).push = null;
    reply(cb, { ok: true });
  });

  // "client namespace disconnect" = o próprio aplicativo chamou socket.disconnect() (botão Sair, bloquear e sair). Qualquer outro motivo
  // (transport close = app/aba fechada, ping timeout/transport error = internet) é QUEDA: a vaga fica reservada para a pessoa voltar.
  // botão Sair da partida (cooperativo): sai de propósito e só responde DEPOIS de apagar o "Continuar jogando" desta sala, para a tela inicial
  // (que o celular recarrega em seguida) já não mostrar o botão verde. Celular antigo, sem este evento, sai pelo disconnect como antes.
  socket.on('leave', async (data, cb) => {
    try { await leaveCurrent(socket, true); } catch (e) { /* a limpeza já registra o erro */ }
    reply(cb, { ok: true });
  });

  socket.on('disconnect', (reason) => leaveCurrent(socket, reason === 'client namespace disconnect'));
});

/* ---------- Limpeza de salas antigas ---------- */
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    const idleMin = (now - room.lastActive) / 60000;
    const ageH = (now - room.createdAt) / 3600000;
    if ((connectedCount(room) === 0 && idleMin > 15) || ageH > 8) {
      clearRematch(room);
      rooms.delete(code);
    }
  }
}, 60000).unref();

async function start() {
  if (DATABASE_URL) {
    try {
      const { createDb } = require('./db');
      const { createAccounts } = require('./accounts');
      const db = createDb(DATABASE_URL);
      if (!db) throw new Error('driver do banco ausente');
      const applied = await db.migrate();                                   // cria/atualiza as tabelas sozinho
      if (applied.length) console.log('[contas] migrações aplicadas:', applied.join(', '));
      accounts = createAccounts({
        app, express, io, db, cleanName, cleanAvatar, roomInfo, roomOfSocket, imageLabel, elapsedOf: elapsed,
        onAuth: bindUserToRooms, mailer, peerOf
      });
      accHooks.duelFinish = (room, result) => accounts.finishDuel(room, result);
      accHooks.levelOf = (uid) => accounts.levelOf(uid);
      console.log('[contas] perfis gerados ATIVOS (login por ID + código-chave, sem e-mail)');
      try {                                                                 // catálogo da biblioteca vindo do banco (validado; se falhar, vale o embutido)
        const ok = await library.loadFromDb(db);
        console.log('[biblioteca] catálogo ' + (ok ? 'carregado do banco' : 'embutido'));
      } catch (e) { console.error('[biblioteca] catálogo do banco ignorado (usando o embutido):', e.message); }
    } catch (e) {
      console.error('[contas] NÃO foi possível ativar as contas (o jogo segue como visitante):', e.message);
      accounts = null;
    }
  }
  server.listen(PORT, '0.0.0.0', () => {
    console.log('Quebra-cabeça a dois rodando na porta ' + PORT);
  });
}
start();
