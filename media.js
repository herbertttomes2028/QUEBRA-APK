'use strict';
/* Origem das imagens da biblioteca.
 * Sem MEDIA_BASE_URL, o jogo usa os arquivos locais (biblioteca/...), como sempre.
 * Com MEDIA_BASE_URL, as imagens vêm de um armazenamento externo com cache (ex.: Cloudflare R2). Esta é a ÚNICA validação dessa variável: a
 * mesma origem entra no catálogo (library.js) e na política de segurança (security.js, img-src). O banco nunca guarda URL: só o nome do arquivo.
 * Regras (falha fechada: valor inválido = ignorado, e o jogo segue com os arquivos locais):
 *   - só https (http só em 127.0.0.1/localhost, para testes);  - sem usuário/senha, sem consulta (?) e sem fragmento (#);
 *   - nome de domínio (nada de endereço IP, exceto 127.0.0.1 nos testes);  - caminho limpo (sem "..", sem "//", sem "%", sem barra invertida). */
const LOCAL = new Set(['127.0.0.1', 'localhost']);

function parseMediaBase(raw) {
  if (raw == null || String(raw).trim() === '') return null;
  const s = String(raw).trim();
  if (s.length > 200 || /[\s\\%]/.test(s) || /\.\.|\/\/(?!$)/.test(s.replace(/^https?:\/\//i, ''))) return null;
  if (/(^|\/)\.(\/|$)/.test(s.replace(/^https?:\/\/[^/]*/i, ''))) return null;          // segmento "." no texto BRUTO (a URL normalizada esconderia isso)
  let u;
  try { u = new URL(s); } catch (e) { return null; }
  if (u.username || u.password || u.search || u.hash) return null;
  const local = LOCAL.has(u.hostname);
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && local)) return null;
  if (!local && (!u.hostname.includes('.') || /^[\d.]+$/.test(u.hostname) || u.hostname.includes(':'))) return null;      // sem IP e sem nome sem ponto
  const path = u.pathname.replace(/\/+$/, '');
  if (path.split('/').some((p) => p === '.' || p === '..')) return null;
  return { base: u.origin + path, origin: u.origin };
}

function fromEnv(env) { return parseMediaBase((env || process.env).MEDIA_BASE_URL); }

module.exports = { parseMediaBase, fromEnv };
