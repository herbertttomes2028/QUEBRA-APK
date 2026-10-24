'use strict';

const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');

const routes = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
]);

const server = http.createServer(async (request, response) => {
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405, { Allow: 'GET, HEAD' });
    response.end();
    return;
  }

  let pathname;
  try {
    pathname = new URL(request.url, 'http://localhost').pathname;
  } catch {
    response.writeHead(400);
    response.end();
    return;
  }

  const file = routes.get(pathname);

  if (!file) {
    response.writeHead(404);
    response.end('Página não encontrada.');
    return;
  }

  try {
    const content = await fs.readFile(path.join(__dirname, file[0]));

    response.writeHead(200, {
      'Content-Type': file[1],
      'Cache-Control': 'no-cache',
    });

    response.end(request.method === 'HEAD' ? undefined : content);
  } catch (error) {
    console.error('Falha ao ler arquivo:', error.message);
    response.writeHead(500);
    response.end('Não foi possível abrir o editor.');
  }
});

server.listen(Number(process.env.PORT || 3000), '0.0.0.0', () => {
  console.log(`Cantos iniciado na porta ${server.address().port}`);
});
