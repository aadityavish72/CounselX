const path = require('path');
module.paths.push(path.join(__dirname, '../Backened/node_modules'));

const fs = require('fs');
const { spawn } = require('child_process');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const HTML_FILE = 'file:///C:/Users/adity/.gemini/antigravity/brain/cb0b0eba-17a8-4d6f-a6b2-f1829ca15655/preview_recommendations.html';
const OUTPUT_PNG = 'C:\\Users\\adity\\.gemini\\antigravity\\brain\\cb0b0eba-17a8-4d6f-a6b2-f1829ca15655\\recommendations_preview_screenshot.png';

class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.id = 1;
    this.callbacks = new Map();
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.onopen = () => resolve();
      this.ws.onerror = (err) => reject(err);
      this.ws.onmessage = (msg) => {
        try {
          const data = JSON.parse(msg.data);
          if (data.id && this.callbacks.has(data.id)) {
            const cb = this.callbacks.get(data.id);
            this.callbacks.delete(data.id);
            if (data.error) cb.reject(new Error(data.error.message || JSON.stringify(data.error)));
            else cb.resolve(data.result);
          }
        } catch (e) {}
      };
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.id++;
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async close() {
    if (this.ws) this.ws.close();
  }
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function capture() {
  console.log('Rendering recommendation page preview screenshot...');

  const edgePort = 9555;
  const userDataDir = path.join(__dirname, '../.tmp_preview_snap_' + Date.now());
  const edgeProc = spawn(EDGE_PATH, [
    '--headless=new',
    `--remote-debugging-port=${edgePort}`,
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--disable-gpu',
    'about:blank'
  ]);

  let cdp = null;

  try {
    let targets = null;
    for (let i = 0; i < 20; i++) {
      await sleep(500);
      try {
        const resp = await fetch(`http://127.0.0.1:${edgePort}/json`);
        if (resp.ok) {
          targets = await resp.json();
          break;
        }
      } catch (e) {}
    }

    const pageTarget = targets.find((t) => t.type === 'page') || targets[0];
    cdp = new CDPClient(pageTarget.webSocketDebuggerUrl);
    await cdp.connect();

    await cdp.send('Page.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1.5,
      mobile: false
    });

    console.log(`Navigating to ${HTML_FILE}...`);
    await cdp.send('Page.navigate', { url: HTML_FILE });
    await sleep(2000); // Allow fonts to load

    const res = await cdp.send('Page.captureScreenshot', { format: 'png', quality: 95 });
    const buffer = Buffer.from(res.data, 'base64');
    fs.writeFileSync(OUTPUT_PNG, buffer);
    console.log(`SUCCESS: Screenshot saved to ${OUTPUT_PNG} (${buffer.length} bytes)`);
  } finally {
    if (cdp) await cdp.close();
    edgeProc.kill();
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch (e) {}
  }
}

capture().catch((e) => {
  console.error('Capture error:', e);
  process.exit(1);
});
