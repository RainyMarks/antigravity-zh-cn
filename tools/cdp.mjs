// Talk to the running Antigravity window over the Chrome DevTools Protocol.
// Antigravity always starts with --remote-debugging-port=0 and writes the chosen
// port to %APPDATA%\Antigravity\DevToolsActivePort.
import fs from 'node:fs';
import path from 'node:path';

export async function connect() {
  const file = path.join(process.env.APPDATA || '', 'Antigravity', 'DevToolsActivePort');
  if (!fs.existsSync(file)) throw new Error(`Antigravity is not running (missing ${file})`);
  const port = fs.readFileSync(file, 'utf8').split(/\r?\n/)[0].trim();
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = list.find((t) => t.type === 'page' && /^https:\/\/127\.0\.0\.1:\d+\//.test(t.url));
  if (!page) throw new Error('Antigravity main window not found');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  });
  const call = (method, params = {}) =>
    new Promise((resolve) => {
      const i = ++id;
      pending.set(i, resolve);
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  const evaluate = async (expression) => {
    const r = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
    return r.result.result.value;
  };
  return { origin: new URL(page.url).origin, evaluate, close: () => ws.close() };
}
