const path = require('path');
module.paths.push(path.join(__dirname, '../Backened/node_modules'));
require('dotenv').config({ path: path.join(__dirname, '../Backened/.env') });

const fs = require('fs');
const { spawn } = require('child_process');
const app = require('../Backened/server');
const connectDB = require('../Backened/db');
const mongoose = require('mongoose');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 5006;
const BASE_URL = `http://localhost:${PORT}`;
const ARTIFACT_DIR = 'C:\\Users\\adity\\.gemini\\antigravity\\brain\\cb0b0eba-17a8-4d6f-a6b2-f1829ca15655';

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

  async evaluate(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    return res.result?.value;
  }

  async captureScreenshot(filename) {
    const res = await this.send('Page.captureScreenshot', { format: 'png', quality: 90 });
    const buffer = Buffer.from(res.data, 'base64');
    const outPath = path.join(ARTIFACT_DIR, filename);
    fs.writeFileSync(outPath, buffer);
    console.log(`Saved screenshot: ${outPath} (${buffer.length} bytes)`);
    return outPath;
  }

  async close() {
    if (this.ws) this.ws.close();
  }
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function capture() {
  console.log('--- Capturing Current Frontend UI Screenshots ---');
  await connectDB();
  const server = app.listen(PORT);

  const edgePort = 9444;
  const userDataDir = path.join(__dirname, '../.tmp_snap_profile_' + Date.now());
  const edgeProc = spawn(EDGE_PATH, [
    '--headless=new',
    `--remote-debugging-port=${edgePort}`,
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--disable-gpu',
    '--window-size=1400,900',
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
    await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1366,
      height: 850,
      deviceScaleFactor: 1.5,
      mobile: false
    });

    // Populate a sample student profile so all pages render with live real data
    await cdp.send('Page.navigate', { url: `${BASE_URL}/frontened/index.html#/home` });
    await sleep(1000);
    await cdp.evaluate(`
      window.CX.store.saveProfile({
        rank: 4500,
        rankType: 'CRL',
        seatCategory: 'OPEN',
        gender: 'Male',
        homeState: 'Delhi',
        year: 2026,
        round: 1,
        quota: 'AI',
        genderPool: 'Gender-Neutral',
        instituteType: 'IIT'
      });
    `);

    // 1. Dashboard
    console.log('Capturing Current Dashboard...');
    await cdp.send('Page.navigate', { url: `${BASE_URL}/frontened/index.html#/dashboard` });
    await sleep(1200);
    await cdp.captureScreenshot('current_dashboard.png');

    // 2. Cutoff Explorer
    console.log('Capturing Current Cutoff Explorer...');
    await cdp.send('Page.navigate', { url: `${BASE_URL}/frontened/index.html#/explore` });
    await sleep(1500);
    // Add two items to comparison and shortlist so the other screens are active
    await cdp.evaluate(`
      const slBtns = document.querySelectorAll("#ex-results .btn-sl-toggle");
      if (slBtns[0]) slBtns[0].click();
      if (slBtns[1]) slBtns[1].click();
      const cmpBtns = document.querySelectorAll("#ex-results .btn-cmp-toggle");
      if (cmpBtns[0]) cmpBtns[0].click();
      if (cmpBtns[1]) cmpBtns[1].click();
      if (cmpBtns[2]) cmpBtns[2].click();
    `);
    await sleep(600);
    await cdp.captureScreenshot('current_cutoff_explorer.png');

    // 3. Recommendations
    console.log('Capturing Current Recommendations...');
    await cdp.send('Page.navigate', { url: `${BASE_URL}/frontened/index.html#/recommendations` });
    await sleep(2000);
    await cdp.captureScreenshot('current_recommendations.png');

    // 4. Comparison
    console.log('Capturing Current Comparison...');
    await cdp.send('Page.navigate', { url: `${BASE_URL}/frontened/index.html#/compare` });
    await sleep(1200);
    await cdp.captureScreenshot('current_comparison.png');

    console.log('--- All Current Screenshots Successfully Captured! ---');
  } finally {
    if (cdp) await cdp.close();
    edgeProc.kill();
    server.close();
    await mongoose.connection.close();
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch (e) {}
  }
}

capture().catch((e) => {
  console.error('Capture error:', e);
  process.exit(1);
});
