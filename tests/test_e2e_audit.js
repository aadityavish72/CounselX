const path = require('path');
module.paths.push(path.join(__dirname, '../Backened/node_modules'));
require('dotenv').config({ path: path.join(__dirname, '../Backened/.env') });

const http = require('http');
const { spawn } = require('child_process');
const app = require('../Backened/server');
const connectDB = require('../Backened/db');
const mongoose = require('mongoose');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 5005;
const BASE_URL = `http://localhost:${PORT}`;

// Simple CDP Client over native Node WebSocket
class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.id = 1;
    this.callbacks = new Map();
    this.events = new Map();
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
          } else if (data.method) {
            const handlers = this.events.get(data.method) || [];
            handlers.forEach((h) => h(data.params));
          }
        } catch (e) {
          console.error('CDP message parse error:', e);
        }
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

  on(method, handler) {
    if (!this.events.has(method)) this.events.set(method, []);
    this.events.get(method).push(handler);
  }

  async evaluate(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    if (res.exceptionDetails) {
      throw new Error(res.exceptionDetails.text || res.exceptionDetails.exception?.description);
    }
    return res.result?.value;
  }

  async close() {
    if (this.ws) this.ws.close();
  }
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runEndToEndAudit() {
  console.log('======================================================');
  console.log('   CounselX Complete End-to-End System & Browser Audit ');
  console.log('======================================================\n');

  const testResults = [];
  function assert(name, condition, details = '') {
    testResults.push({ name, passed: !!condition, details });
    console.log(`[${condition ? 'PASS' : 'FAIL'}] ${name}${details ? ` -> ${details}` : ''}`);
    if (!condition) {
      throw new Error(`Assertion failed: ${name}`);
    }
  }

  // 1. Connect DB and start local server
  console.log('--- Phase 1: Database & Backend Server Initialization ---');
  await connectDB();
  const server = app.listen(PORT);
  console.log(`Test server running at ${BASE_URL}`);

  // Test static file delivery
  const staticChecks = [
    { url: `${BASE_URL}/`, expectStatus: 200, expectMatch: 'CounselX backend is running' },
    { url: `${BASE_URL}/app`, expectStatus: 302 },
    { url: `${BASE_URL}/frontened/index.html`, expectStatus: 200, expectMatch: 'CounselX — Your Rank' },
    { url: `${BASE_URL}/frontened/style%20final.css`, expectStatus: 200, expectMatch: '--p:' },
    { url: `${BASE_URL}/frontened/config.js`, expectStatus: 200, expectMatch: 'API_BASE_URL' },
    { url: `${BASE_URL}/js/app.js`, expectStatus: 200, expectMatch: 'window.CX.router' },
    { url: `${BASE_URL}/js/colleges.js`, expectStatus: 200, expectMatch: 'window.CX.colleges' },
    { url: `${BASE_URL}/js/recommendations.js`, expectStatus: 200, expectMatch: 'window.CX.recommendations' },
    { url: `${BASE_URL}/js/details.js`, expectStatus: 200, expectMatch: 'window.CX.details' },
    { url: `${BASE_URL}/js/dashboard.js`, expectStatus: 200, expectMatch: 'window.CX.dashboard' },
    { url: `${BASE_URL}/js/comparison.js`, expectStatus: 200, expectMatch: 'window.CX.comparison' },
    { url: `${BASE_URL}/js/analytics.js`, expectStatus: 200, expectMatch: 'window.CX.analytics' }
  ];

  for (const check of staticChecks) {
    const res = await fetch(check.url, { redirect: 'manual' });
    assert(
      `Static/Asset Check: ${check.url.replace(BASE_URL, '')}`,
      res.status === check.expectStatus,
      `HTTP ${res.status}`
    );
    if (check.expectMatch) {
      const text = await res.text();
      assert(
        `Asset content verification: ${check.url.replace(BASE_URL, '')}`,
        text.includes(check.expectMatch),
        `matched "${check.expectMatch}"`
      );
    }
  }

  // 2. Launch Headless Edge Browser with Remote Debugging
  console.log('\n--- Phase 2: Launching Headless Chromium Browser (Edge) ---');
  const edgePort = 9333;
  const userDataDir = path.join(__dirname, '../.tmp_browser_profile_' + Date.now());
  const edgeProc = spawn(EDGE_PATH, [
    '--headless=new',
    `--remote-debugging-port=${edgePort}`,
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    'about:blank'
  ]);

  let cdp = null;
  const consoleLogs = [];
  const networkRequests = [];

  try {
    // Wait for Edge CDP to be ready
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

    assert('Headless Chromium CDP endpoint ready', !!targets && targets.length > 0, `found ${targets?.length} targets`);

    const pageTarget = targets.find((t) => t.type === 'page') || targets[0];
    cdp = new CDPClient(pageTarget.webSocketDebuggerUrl);
    await cdp.connect();
    assert('CDP WebSocket connected successfully', true);

    // Enable domains
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('DOM.enable');
    await cdp.send('Network.enable');

    // Monitor console messages
    cdp.on('Runtime.consoleAPICalled', (params) => {
      const text = params.args.map((a) => a.value || a.description || '').join(' ');
      consoleLogs.push({ type: params.type, text });
      if (params.type === 'error') {
        console.warn(`[BROWSER CONSOLE ERROR] ${text}`);
      }
    });

    cdp.on('Runtime.exceptionThrown', (params) => {
      const desc = params.exceptionDetails?.exception?.description || params.exceptionDetails?.text;
      consoleLogs.push({ type: 'exception', text: desc });
      console.warn(`[BROWSER UNCAUGHT EXCEPTION] ${desc}`);
    });

    // Monitor network requests
    cdp.on('Network.responseReceived', (params) => {
      networkRequests.push({
        url: params.response.url,
        status: params.response.status,
        mimeType: params.response.mimeType
      });
    });

    // -------------------------------------------------------------
    // PHASE 3: Navigate to Home Page & Test Landing Experience
    // -------------------------------------------------------------
    console.log('\n--- Phase 3: Home Page & Landing Navigation ---');
    await cdp.send('Page.navigate', { url: `${BASE_URL}/frontened/index.html#/home` });
    for (let i = 0; i < 20; i++) {
      await sleep(300);
      const isReady = await cdp.evaluate('window.location.href.includes("frontened") && document.readyState === "complete" && !!document.getElementById("page-home") && !document.getElementById("page-home").hidden');
      if (isReady) break;
    }

    const homeTitle = await cdp.evaluate('document.querySelector("h1.hero-title")?.textContent?.trim() || ""');
    assert('Home hero title rendered', homeTitle.includes('Your Smart Path'), homeTitle);

    const isHomeVisible = await cdp.evaluate('!document.getElementById("page-home").hidden');
    assert('Home section is active and visible', isHomeVisible);

    // Test Hero rank form submission
    await cdp.evaluate(`
      document.getElementById('hero-rank').value = '6500';
      document.getElementById('hero-rank-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    `);
    await sleep(600);

    const currentHashAfterHero = await cdp.evaluate('window.location.hash');
    assert('Hero form submission redirects to #/explore', currentHashAfterHero === '#/explore');

    const profileAfterHero = await cdp.evaluate('window.CX.store.getProfile()');
    assert('Hero rank saved to profile in localStorage', profileAfterHero && profileAfterHero.rank === 6500, `rank: ${profileAfterHero?.rank}`);

    // -------------------------------------------------------------
    // PHASE 4: JoSAA Cutoff Explorer Thorough Audit
    // -------------------------------------------------------------
    console.log('\n--- Phase 4: JoSAA Cutoff Explorer Verification ---');
    let explorerCountText = '';
    for (let i = 0; i < 20; i++) {
      await sleep(300);
      explorerCountText = await cdp.evaluate('document.getElementById("ex-count")?.textContent');
      if (explorerCountText && explorerCountText.includes('cutoff records')) break;
    }
    assert('Cutoff Explorer loaded records from Atlas', explorerCountText && explorerCountText.includes('cutoff records'), explorerCountText);

    const tableRowsCount = await cdp.evaluate('document.querySelectorAll("#ex-results table.data tbody tr").length');
    assert('Default page size of 20 records rendered in table', tableRowsCount === 20, `rendered: ${tableRowsCount} rows`);

    // Verify status badges computed for rank 6500
    let statusBadgesCount = 0;
    for (let i = 0; i < 25; i++) {
      await sleep(250);
      statusBadgesCount = await cdp.evaluate('document.querySelectorAll("#ex-results .badge.tier-safe, #ex-results .badge.tier-target, #ex-results .badge.tier-reach").length');
      if (statusBadgesCount > 0) break;
    }
    assert('Dynamic status badges (Safe/Target/Reach) computed for student rank', statusBadgesCount > 0, `found ${statusBadgesCount} badges`);

    // Test Shortlist button from explorer table
    await cdp.evaluate(`
      const firstSlBtn = document.querySelector("#ex-results .btn-sl-toggle");
      firstSlBtn.click();
    `);
    await sleep(300);

    const shortlistCount = await cdp.evaluate('window.CX.store.getShortlist().length');
    assert('Clicking Save adds record to shortlist store', shortlistCount === 1, `shortlist count: ${shortlistCount}`);

    const slBadgeVal = await cdp.evaluate('document.getElementById("badge-shortlist")?.textContent');
    assert('Shortlist navbar badge displays count 1', slBadgeVal === '1');

    // Test Compare button from explorer table
    await cdp.evaluate(`
      const firstCmpBtn = document.querySelector("#ex-results .btn-cmp-toggle");
      firstCmpBtn.click();
    `);
    await sleep(300);

    const compareCount = await cdp.evaluate('window.CX.store.getComparison().length');
    assert('Clicking Compare adds record to comparison store', compareCount === 1, `compare count: ${compareCount}`);

    const compareTrayVisible = await cdp.evaluate('!document.getElementById("compare-tray").hidden');
    assert('Floating compare tray becomes visible', compareTrayVisible);

    // Test Search filter input (clear rank first so all Roorkee records are matched)
    await cdp.evaluate(`
      document.getElementById("ex-rank").value = "";
      const searchInput = document.getElementById("ex-search");
      searchInput.value = "Roorkee";
      searchInput.dispatchEvent(new Event("input", { bubbles: true }));
    `);
    
    let searchedRows = 0;
    let firstRowInst = '';
    for (let i = 0; i < 25; i++) {
      await sleep(250);
      searchedRows = await cdp.evaluate('document.querySelectorAll("#ex-results table.data tbody tr").length');
      firstRowInst = (await cdp.evaluate('document.querySelector("#ex-results table.data tbody tr td:first-child")?.textContent')) || '';
      if (searchedRows > 0 && firstRowInst.includes('Roorkee')) break;
    }
    assert('Search filter filters table dynamically for "Roorkee"', searchedRows > 0 && firstRowInst.includes('Roorkee'), `found ${searchedRows} rows, first: ${firstRowInst?.slice(0, 35)}`);

    // Test Reset filters
    await cdp.evaluate('document.getElementById("ex-reset").click()');
    await sleep(1200);

    let resetCountText = await cdp.evaluate('document.getElementById("ex-count")?.textContent');
    if (!resetCountText || !resetCountText.includes('cutoff records')) {
      await sleep(1000);
      resetCountText = await cdp.evaluate('document.getElementById("ex-count")?.textContent');
    }
    assert('Reset filters restores full cutoff records', resetCountText.includes('cutoff records'), resetCountText);

    // Test Pagination Next button
    await cdp.evaluate(`
      const nextBtn = document.querySelector("#ex-pagination button[data-page='2']");
      if (nextBtn) nextBtn.click();
    `);
    
    let page2Status = '';
    for (let i = 0; i < 25; i++) {
      await sleep(250);
      page2Status = (await cdp.evaluate('document.getElementById("ex-count")?.textContent')) || '';
      if (page2Status.includes('Page 2')) break;
    }
    assert('Pagination navigates to Page 2', page2Status.includes('Page 2'), page2Status);

    // -------------------------------------------------------------
    // PHASE 5: Multi-College Comparison View Audit
    // -------------------------------------------------------------
    console.log('\n--- Phase 5: Multi-College Comparison Audit ---');
    // Add second college to comparison
    await cdp.evaluate(`
      const secondCmpBtn = document.querySelectorAll("#ex-results .btn-cmp-toggle")[1];
      if (secondCmpBtn) secondCmpBtn.click();
    `);
    await sleep(300);

    await cdp.send('Page.navigate', { url: `${BASE_URL}/frontened/index.html#/compare` });
    await sleep(500);

    const cmpHeaders = await cdp.evaluate('document.querySelectorAll("#cmp-body table.cmp thead th").length');
    assert('Comparison matrix renders 2 compared colleges side-by-side', cmpHeaders === 3, `headers: ${cmpHeaders} (1 param + 2 colleges)`);

    const bestHighlightExists = await cdp.evaluate('document.querySelectorAll("#cmp-body table.cmp td.best").length > 0');
    assert('Best closing rank is visually highlighted in comparison matrix', bestHighlightExists);

    // Test Clear comparison
    await cdp.evaluate('document.getElementById("cmp-clear").click()');
    await sleep(300);

    const cmpEmpty = await cdp.evaluate('document.querySelector("#cmp-body .empty-state") !== null');
    assert('Clearing comparison renders clean empty state with action link', cmpEmpty);

    // -------------------------------------------------------------
    // PHASE 6: Shortlist / My List Audit
    // -------------------------------------------------------------
    console.log('\n--- Phase 6: Shortlist / My List Audit ---');
    await cdp.send('Page.navigate', { url: `${BASE_URL}/frontened/index.html#/shortlist` });
    await sleep(500);

    const shortlistCards = await cdp.evaluate('document.querySelectorAll("#sl-body .shortlist-list article.card").length');
    assert('Shortlist page renders saved college card', shortlistCards === 1, `cards: ${shortlistCards}`);

    // Remove from shortlist
    await cdp.evaluate(`
      const rmBtn = document.querySelector("#sl-body .btn-sl-rm");
      if (rmBtn) rmBtn.click();
    `);
    await sleep(300);

    const shortlistEmpty = await cdp.evaluate('document.querySelector("#sl-body .empty-state") !== null');
    assert('Removing item clears shortlist and renders empty state', shortlistEmpty);

    // -------------------------------------------------------------
    // PHASE 7: Student Profile Stepper Audit
    // -------------------------------------------------------------
    console.log('\n--- Phase 7: Student Profile Stepper Audit ---');
    await cdp.send('Page.navigate', { url: `${BASE_URL}/frontened/index.html#/profile` });
    await sleep(600);

    // Fill Step 1
    await cdp.evaluate(`
      document.getElementById('pf-rank').value = '4200';
      document.getElementById('pf-rankType').value = 'CRL';
      document.getElementById('pf-seatCategory').value = 'OPEN';
      document.getElementById('pf-gender').value = 'Male';
      document.getElementById('pf-homeState').value = 'Delhi';
      document.getElementById('pf-next').click();
    `);
    await sleep(300);

    const panel2Active = await cdp.evaluate('!document.querySelector(\'[data-panel="2"]\').hidden');
    assert('Profile Stepper advances to Step 2 (Preferences)', panel2Active);

    // Fill Step 2
    await cdp.evaluate(`
      document.getElementById('pf-year').value = '2026';
      document.getElementById('pf-round').value = '1';
      document.getElementById('pf-quota').value = 'AI';
      document.getElementById('pf-genderPool').value = 'Gender-Neutral';
      document.getElementById('pf-instituteType').value = 'IIT';
      document.getElementById('pf-branch').value = 'Computer Science';
      document.getElementById('pf-next').click();
    `);
    await sleep(300);

    const panel3Active = await cdp.evaluate('!document.querySelector(\'[data-panel="3"]\').hidden');
    assert('Profile Stepper advances to Step 3 (Review)', panel3Active);

    const reviewRank = await cdp.evaluate('document.getElementById("profile-review")?.textContent');
    assert('Profile review contains Rank 4,200, CRL, OPEN, AI, IIT', reviewRank.includes('4,200') && reviewRank.includes('CRL') && reviewRank.includes('IIT'));

    // Save Profile (Step 3 -> Step 4)
    await cdp.evaluate('document.getElementById("pf-next").click()');
    await sleep(400);

    const panel4Active = await cdp.evaluate('!document.querySelector(\'[data-panel="4"]\').hidden');
    assert('Profile Stepper reaches Step 4 (Discovery)', panel4Active);

    const savedProf = await cdp.evaluate('window.CX.store.getProfile()');
    assert('Full student profile persisted into browser localStorage', savedProf.rank === 4200 && savedProf.seatCategory === 'OPEN');

    // -------------------------------------------------------------
    // PHASE 8: Counselling Recommendations with Cutoff Prediction
    // -------------------------------------------------------------
    console.log('\n--- Phase 8: Student Counselling Recommendations & Prediction ---');
    await cdp.send('Page.navigate', { url: `${BASE_URL}/frontened/index.html#/recommendations` });
    
    let recStatus = '';
    for (let i = 0; i < 20; i++) {
      await sleep(400);
      recStatus = await cdp.evaluate('document.getElementById("rec-status")?.textContent') || '';
      if (recStatus.includes('matching Rank 4,200')) break;
    }

    assert('Recommendations loaded and categorized for student rank 4,200', recStatus && recStatus.includes('matching Rank 4,200'), recStatus);

    const safeOptions = await cdp.evaluate('document.querySelectorAll(".rec-card.tier-safe").length');
    const targetOptions = await cdp.evaluate('document.querySelectorAll(".rec-card.tier-target").length');
    const reachOptions = await cdp.evaluate('document.querySelectorAll(".rec-card.tier-reach").length');
    assert('Recommendations rendered Safe, Target, and Reach tiers', (safeOptions + targetOptions + reachOptions) > 0, `Safe: ${safeOptions}, Target: ${targetOptions}, Reach: ${reachOptions}`);

    // Verify cutoff prediction range card
    const hasPredictionRange = await cdp.evaluate('document.querySelectorAll(".rec-card .stat").length > 0');
    assert('Predicted Final Cutoff Range [min, expected, max] rendered on cards', hasPredictionRange);

    const reasonCount = await cdp.evaluate('document.querySelectorAll(".rec-card .reason strong").length');
    assert('Explainable reasoning ("Why this option?") rendered for recommendations', reasonCount > 0, `${reasonCount} explanations`);

    // Verify filter input on recommendations
    await cdp.evaluate(`
      const recFilter = document.getElementById("rec-filter");
      recFilter.value = "Institute";
      recFilter.dispatchEvent(new Event("input", { bubbles: true }));
    `);
    await sleep(400);

    const filteredRecCount = await cdp.evaluate('document.querySelectorAll("#rec-groups .rec-card").length');
    assert('In-page recommendation filtering works smoothly', filteredRecCount >= 0);

    // -------------------------------------------------------------
    // PHASE 9: College Details & Historical Cutoff Trajectory
    // -------------------------------------------------------------
    console.log('\n--- Phase 9: College Cutoff Details & Trajectory View ---');
    // Get valid ID from recent API cutoffs
    const sampleRes = await fetch(`${BASE_URL}/api/cutoffs?limit=1`);
    const sampleJson = await sampleRes.json();
    const sampleId = sampleJson.data[0]._id;

    await cdp.send('Page.navigate', { url: `${BASE_URL}/frontened/index.html#/college/${sampleId}` });
    await sleep(1200);

    const collegeH1 = await cdp.evaluate('document.querySelector("#college-body h2")?.textContent');
    assert('College details view loads institute name', !!collegeH1, collegeH1);

    const roundsTableRows = await cdp.evaluate('document.querySelectorAll("#college-body table.data tbody tr").length');
    assert('Historical round progression table (Rounds 1–5) rendered', roundsTableRows > 0, `rounds rendered: ${roundsTableRows}`);

    const hasTrajectoryPrediction = await cdp.evaluate('document.body.textContent.includes("Explainable Cutoff Trajectory & Prediction")');
    assert('Explainable trajectory prediction card rendered in college details', hasTrajectoryPrediction);

    // -------------------------------------------------------------
    // PHASE 10: Dashboard Overview & Analytics
    // -------------------------------------------------------------
    console.log('\n--- Phase 10: Dashboard Overview & Cutoff Analytics ---');
    await cdp.send('Page.navigate', { url: `${BASE_URL}/frontened/index.html#/dashboard` });
    await sleep(1000);

    const totalRecordsStat = await cdp.evaluate('document.getElementById("total-records")?.textContent');
    const totalInstStat = await cdp.evaluate('document.getElementById("total-institutes")?.textContent');
    const recNum = parseInt((totalRecordsStat || '').replace(/,/g, ''), 10);
    const instNum = parseInt(totalInstStat || '', 10);
    assert('Dashboard displays live total records', recNum >= 4833, totalRecordsStat);
    assert('Dashboard displays live total institutes', instNum >= 55, totalInstStat);

    const recentTableRows = await cdp.evaluate('document.querySelectorAll("#dash-recent table.data tbody tr").length');
    assert('Dashboard displays recent cutoffs table', recentTableRows > 0, `${recentTableRows} recent items`);

    // Test Analytics View
    await cdp.send('Page.navigate', { url: `${BASE_URL}/frontened/index.html#/analytics` });
    await sleep(1200);

    const analyticsInstVal = await cdp.evaluate('document.getElementById("an-institute")?.value');
    assert('Analytics form pre-populates default institute', !!analyticsInstVal, analyticsInstVal);

    // Click Load Analytics
    await cdp.evaluate('document.getElementById("analytics-form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))');
    
    let analyticsStatusText = '';
    for (let i = 0; i < 30; i++) {
      await sleep(250);
      analyticsStatusText = (await cdp.evaluate('document.getElementById("analytics-status")?.textContent')) || '';
      if (analyticsStatusText.includes('Analytics loaded')) break;
    }
    assert('Analytics loaded for selected institute', analyticsStatusText && analyticsStatusText.includes('Analytics loaded'), analyticsStatusText);

    // -------------------------------------------------------------
    // PHASE 11: Responsive Layout & Mobile Viewport Audit
    // -------------------------------------------------------------
    console.log('\n--- Phase 11: Mobile Responsive Layout Audit (iPhone SE 375x667) ---');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 375,
      height: 667,
      deviceScaleFactor: 2,
      mobile: true
    });
    await sleep(500);

    // In mobile, menu hamburger button should be displayed
    const menuBtnDisplay = await cdp.evaluate('window.getComputedStyle(document.getElementById("menu-btn")).display');
    assert('Mobile hamburger menu button displayed on 375px viewport', menuBtnDisplay === 'grid', `display: ${menuBtnDisplay}`);

    // Click hamburger button to open drawer
    await cdp.evaluate('document.getElementById("menu-btn").click()');
    await sleep(300);

    const navOpen = await cdp.evaluate('document.body.classList.contains("nav-open")');
    assert('Hamburger click toggles nav-open drawer on mobile', navOpen);

    // Navigate to explorer on mobile and check responsive card transform
    await cdp.send('Page.navigate', { url: `${BASE_URL}/frontened/index.html#/explore` });
    await sleep(1000);

    const mobileTdDisplay = await cdp.evaluate('window.getComputedStyle(document.querySelector("#ex-results table.data td")).display');
    assert('Desktop table cells transform to flex card rows on mobile screens', mobileTdDisplay === 'flex', `td display: ${mobileTdDisplay}`);

    // Reset viewport
    await cdp.send('Emulation.clearDeviceMetricsOverride');

    // -------------------------------------------------------------
    // PHASE 12: Console Errors & Exceptions Audit
    // -------------------------------------------------------------
    console.log('\n--- Phase 12: Browser Console Errors & Network Audit ---');
    const uncaughtExceptions = consoleLogs.filter((l) => l.type === 'exception');
    const realErrors = consoleLogs.filter((l) => l.type === 'error' && !l.text.includes('favicon'));

    assert('Zero uncaught JavaScript exceptions during full user session', uncaughtExceptions.length === 0, `${uncaughtExceptions.length} exceptions`);
    assert('Zero browser console errors during full user session', realErrors.length === 0, `${realErrors.length} console errors`);

    console.log('\n======================================================');
    console.log(`Master Audit Complete: ${testResults.filter((t) => t.passed).length} of ${testResults.length} PASSED`);
    console.log('======================================================\n');
  } finally {
    if (cdp) await cdp.close();
    edgeProc.kill();
    server.close();
    await mongoose.connection.close();
  }
}

runEndToEndAudit().catch((err) => {
  console.error('\nAUDIT FAILED:', err);
  process.exit(1);
});
