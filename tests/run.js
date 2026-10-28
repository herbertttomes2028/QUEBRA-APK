'use strict';
// Executor portátil (Node 18+, Windows/Linux/macOS): roda todos os tests/*.test.js com o test runner nativo do Node.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const files = fs.readdirSync(__dirname).filter((f) => f.endsWith('.test.js')).sort().map((f) => path.join(__dirname, f));
const r = spawnSync(process.execPath, ['--test'].concat(process.argv.slice(2), files), { stdio: 'inherit' });
process.exit(r.status === null ? 1 : r.status);
