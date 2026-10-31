'use strict';
// Regressão da desconexão de conta ao finalizar uma sala cooperativa.
// Executa o verdadeiro createAccounts e seus handlers, com SQL e Socket.IO simulados;
// nunca consulta o Neon/Render nem precisa de dados pessoais de jogadores.
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createHash } = require('node:crypto');
const { createAccounts } = require('../accounts');

function deferred() {
  let resolve;
  const promise = new Promise((res) => { resolve = res; });
  return { promise, resolve };
}
function fixture() {
  const authToken = 'token-de-teste-que-nao-pertence-a-nenhum-jogador';
  const hash = createHash('sha256').update(authToken).digest('hex');
  const user = { id: 42, friend_code: 'ABCDEFGH', name: 'Teste', xp_seeded: true, xp: 100 };
  const delayed = deferred();
  let holdFirst = false;
  let didHold = false;
  let validSession = true;
  const hooks = [];
  const io = new EventEmitter();
  io.sockets = { sockets: new Map() };
  io.to = () => ({ emit() {} });
  const socket = new EventEmitter();
  socket.id = 'test-coop-socket';
  socket.connected = true;
  socket.data = {};
  socket.join = () => {};
  socket.leave = () => {};
  io.sockets.sockets.set(socket.id, socket);
  const db = {
    q(sql, params) {
      if (sql.startsWith('SELECT u.* FROM sessions')) {
        const row = validSession && params[0] === hash ? [user] : [];
        if (holdFirst && !didHold) {
          didHold = true;
          return delayed.promise;
        }
        return Promise.resolve({ rows: row });
      }
      if (sql.startsWith('SELECT xp, xp_seeded FROM users WHERE id = $1 FOR UPDATE'))
        return Promise.resolve({ rows: [{ xp: 100, xp_seeded: true }] });
      if (sql.startsWith('UPDATE users SET last_seen')) return Promise.resolve({ rows: [] });
      if (sql.startsWith('SELECT blocker, blocked FROM blocks')) return Promise.resolve({ rows: [] });
      if (sql.startsWith('SELECT friend_code FROM users'))
        return Promise.resolve({ rows: [{ friend_code: 'ABCDEFGH' }] });
      if (sql.includes('FROM friendships')) return Promise.resolve({ rows: [] });
      throw Error('Consulta SQL não esperada neste teste: ' + sql.slice(0, 120));
    }
  };
  const router = () => ({ get() { return this; }, post() { return this; }, use() { return this; } });
  const app = { use() {} };
  const express = { Router: router, json: () => (_, __, next) => next() };
  const accounts = createAccounts({
    app, express, io, db, cleanName: (n) => n, cleanAvatar: () => '',
    roomInfo: () => null, roomOfSocket: () => null, imageLabel: (s) => s,
    getUpload: () => null, putUpload: () => null,
    onAuth: (_, uid) => hooks.push(uid), mailer: null, peerOf: () => null
  });
  io.emit('connection', socket);
  function ack(event, data) {
    return new Promise((resolve) => socket.emit(event, data, resolve));
  }
  return {
    socket, accounts, hash, authToken, hooks, ack,
    delayNextAuth() { holdFirst = true; },
    completeDelayedAuth() {
      delayed.resolve({ rows: validSession ? [user] : [] });
    },
    revokeSession() { validSession = false; },
    close() { accounts.close(); socket.emit('disconnect'); }
  };
}

test('após vitória e retorno à tela inicial: resposta antiga de auth não derruba a conta válida', async () => {
  const f = fixture();
  try {
    f.delayNextAuth();
    const earlier = f.ack('acc:auth', { token: f.authToken });
    const newer = f.ack('acc:auth', { token: f.authToken });
    const current = await newer;
    assert.deepEqual(current, { ok: true });
    f.completeDelayedAuth();
    const old = await earlier;
    assert.deepEqual(old, { ok: false, error: 'superseded' },
      'uma resposta obsoleta NÃO pode usar error=auth, pois o celular apagaria o login');
    assert.equal(f.socket.data.uid, 42);
    assert.equal(f.socket.data.sessionHash, f.hash);
    assert.deepEqual(f.hooks, [42], 'somente a autenticação atual deve vincular a conta');
  } finally { f.close(); }
});

test('revalidar repetidamente o mesmo token preserva o vínculo e a presença dos amigos', async () => {
  const f = fixture();
  try {
    for (let i = 0; i < 4; i++) assert.deepEqual(await f.ack('acc:auth', { token: f.authToken }), { ok: true });
    assert.equal(f.socket.data.uid, 42);
    assert.deepEqual(f.hooks, [42], 'não simular logout/login da mesma conta a cada tela');
    assert.equal(f.accounts.isOnline(42), true);
  } finally { f.close(); }
});

test('token realmente revogado continua sendo recusado; terminar partida não revalida token inválido', async () => {
  const f = fixture();
  try {
    assert.deepEqual(await f.ack('acc:auth', { token: f.authToken }), { ok: true });
    f.revokeSession();
    assert.deepEqual(await f.ack('acc:auth', { token: f.authToken }), { ok: false, error: 'auth' });
    assert.equal(f.socket.data.uid, 42, 'revogação via HTTP aplica seu próprio mecanismo de desligar sockets');
    assert.deepEqual(await f.ack('acc:logout'), { ok: true });
    assert.equal(f.socket.data.uid, null);
    assert.equal(f.accounts.isOnline(42), false);
  } finally { f.close(); }
});

test('logout durante autenticação pendente impede reconexão da conta por uma resposta atrasada', async () => {
  const f = fixture();
  try {
    f.delayNextAuth();
    const pending = f.ack('acc:auth', { token: f.authToken });
    assert.deepEqual(await f.ack('acc:logout'), { ok: true });
    f.completeDelayedAuth();
    assert.deepEqual(await pending, { ok: false, error: 'superseded' });
    assert.equal(f.socket.data.uid, undefined);
  } finally { f.close(); }
});
