// Download the web UI bundle (main.js) served by the running Antigravity's language server.
//
//   node tools/fetch-bundle.mjs        -> .work/main.js
//
// Antigravity must be running. The bundle is only used locally for string extraction;
// never commit it (it is Google's code).
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { connect } from './cdp.mjs';
import { WORK } from './lib.mjs';

const cdp = await connect();
const version = await cdp.evaluate('window.__APP_CONFIG__ && window.__APP_CONFIG__.appVersion');
cdp.close();

const get = (url) =>
  new Promise((resolve, reject) => {
    // The language server uses a self-signed certificate on 127.0.0.1.
    https
      .get(url, { rejectUnauthorized: false }, (res) => {
        if (res.statusCode !== 200) return reject(new Error(`${url}: HTTP ${res.statusCode}`));
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      })
      .on('error', reject);
  });

fs.mkdirSync(WORK, { recursive: true });
const html = (await get(cdp.origin + '/')).toString('utf8');
const scripts = [...html.matchAll(/<script[^>]+src="(\/[^"]+\.js)"/g)].map((m) => m[1]);
for (const s of scripts) {
  const buf = await get(cdp.origin + s);
  fs.writeFileSync(path.join(WORK, path.basename(s)), buf);
  console.log(`${s} -> .work/${path.basename(s)} (${(buf.length / 1048576).toFixed(1)} MB)`);
}
fs.writeFileSync(path.join(WORK, 'app-version.txt'), String(version || ''));
console.log('Antigravity version:', version);
