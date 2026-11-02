const path = require('path');
module.paths.push(path.join(__dirname, '../Backened/node_modules'));

const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../Backened/.env') });
const connectDB = require('../Backened/db');
const http = require('http');
const { spawn } = require('child_process');
const app = require('../Backened/server');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 5006;
const BASE_URL = `http://localhost:${PORT}/frontened/index.html#/recommendations`;
const OUTPUT_PNG = 'C:\\Users\\adity\\.gemini\\antigravity\\brain\\cb0b0eba-17a8-4d6f-a6b2-f1829ca15655\\counselx_live_recommendations.png';

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

async function main() {
  await connectDB();
  console.log('Starting CounselX backend on port', PORT);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(PORT, resolve));

  const edgePort = 9556;
  const userDataDir = path.join(__dirname, '../.tmp_live_snap_' + Date.now());
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
      height: 1300,
      deviceScaleFactor: 1.5,
      mobile: false
    });

    // Seed profile in localStorage before loading recommendations
    await cdp.send('Page.navigate', { url: `http://localhost:${PORT}/frontened/index.html#/home` });
    await sleep(1000);

    await cdp.send('Runtime.evaluate', {
      expression: `
        localStorage.setItem('cx_user_profile', JSON.stringify({
          rank: 4500,
          rankType: 'CRL',
          seatCategory: 'OPEN',
          gender: 'Male',
          genderPool: 'Gender-Neutral',
          homeState: 'Maharashtra',
          quota: 'AI',
          instituteType: 'All',
          year: 2026,
          round: 1
        }));
      `
    });

    console.log(`Navigating to ${BASE_URL}...`);
    await cdp.send('Page.navigate', { url: BASE_URL });
    await sleep(2500); // Allow recommendations API to resolve and render

    const res = await cdp.send('Page.captureScreenshot', { format: 'png', quality: 95 });
    fs.writeFileSync(OUTPUT_PNG, Buffer.from(res.data, 'base64'));
    console.log('Live recommendation page screenshot saved successfully to:', OUTPUT_PNG);
  } finally {
    if (cdp) await cdp.close();
    edgeProc.kill('SIGKILL');
    server.close();
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch (e) {}
  }
}

main().catch((err) => {
  console.error('Screenshot failed:', err);
  process.exit(1);
});
