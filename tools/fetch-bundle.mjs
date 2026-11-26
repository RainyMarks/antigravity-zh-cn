// Download the web UI bundle (scripts and stylesheets) served by the running Antigravity's
// language server.
//
//   node tools/fetch-bundle.mjs        -> .work/main.js, .work/compiled_tailwind.css, ...
//
// Antigravity must be running. The UI origin is found through the DevTools port when
// Antigravity was started with --remote-debugging-port; since 2.33 that port is off by
// default, so otherwise the language server's listening ports are probed instead.
// The bundle is only used locally for string extraction and theme checks; never commit it
// (it is Google's code).
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { execFileSync } from 'node:child_process';
import { connect } from './cdp.mjs';
import { WORK } from './lib.mjs';

const get = (url) =>
  new Promise((resolve, reject) => {
    // The language server uses a self-signed certificate on 127.0.0.1.
    https
      .get(url, { rejectUnauthorized: false, timeout: 5000 }, (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`${url}: HTTP ${res.statusCode}`));
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      })
      .on('timeout', function () {
        this.destroy(new Error(`${url}: timeout`));
      })
      .on('error', reject);
  });

/** Ports that language_server.exe listens on (Windows). */
function languageServerPorts() {
  const tasks = execFileSync('tasklist', ['/FI', 'IMAGENAME eq language_server.exe', '/FO', 'CSV', '/NH'], { encoding: 'utf8' });
  const pids = new Set(tasks.split(/\r?\n/).map((l) => (l.split('","')[1] || '').replace(/"/g, '')).filter(Boolean));
  const ports = [];
  for (const line of execFileSync('netstat', ['-ano', '-p', 'TCP'], { encoding: 'utf8' }).split(/\r?\n/)) {
    const m = /^\s*TCP\s+127\.0\.0\.1:(\d+)\s+\S+\s+LISTENING\s+(\d+)\s*$/.exec(line);
    if (m && pids.has(m[2])) ports.push(m[1]);
  }
  return ports;
}

async function findUi() {
  try {
    const cdp = await connect();
    const version = await cdp.evaluate('window.__APP_CONFIG__ && window.__APP_CONFIG__.appVersion');
    cdp.close();
    return { origin: cdp.origin, version };
  } catch (e) {
    for (const port of languageServerPorts()) {
      const origin = `https://127.0.0.1:${port}`;
      const html = await get(origin + '/').then((b) => b.toString('utf8'), () => '');
      const config = /window\.__APP_CONFIG__ = (\{.*?\});/.exec(html);
      if (config) return { origin, version: JSON.parse(config[1]).appVersion };
    }
    throw e;
  }
}

const { origin, version } = await findUi();
fs.mkdirSync(WORK, { recursive: true });
const html = (await get(origin + '/')).toString('utf8');
const files = [
  ...[...html.matchAll(/<script[^>]+src="(\/[^"]+\.js)"/g)].map((m) => m[1]),
  ...[...html.matchAll(/<link[^>]+href="(\/[^"]+\.css)"/g)].map((m) => m[1]),
];
for (const f of files) {
  const buf = await get(origin + f);
  fs.writeFileSync(path.join(WORK, path.basename(f)), buf);
  console.log(`${f} -> .work/${path.basename(f)} (${(buf.length / 1048576).toFixed(1)} MB)`);
}
fs.writeFileSync(path.join(WORK, 'app-version.txt'), String(version || ''));
console.log('Antigravity version:', version);
