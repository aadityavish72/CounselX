const path = require('path');
module.paths.push(path.join(__dirname, '../Backened/node_modules'));
require('dotenv').config({ path: path.join(__dirname, '../Backened/.env') });
const app = require('../Backened/server');
const connectDB = require('../Backened/db');
const mongoose = require('mongoose');

async function testPredictionEndpoints() {
  console.log('=== Prediction & Counselling API Endpoints Verification ===\n');

  await connectDB();
  const server = app.listen(5004);
  const baseUrl = 'http://localhost:5004';

  async function get(path) {
    const res = await fetch(baseUrl + path);
    const contentType = res.headers.get('content-type') || '';
    const body = contentType.includes('application/json') ? await res.json() : await res.text();
    return { status: res.status, ok: res.ok, body };
  }

  async function post(path, data) {
    const res = await fetch(baseUrl + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const contentType = res.headers.get('content-type') || '';
    const body = contentType.includes('application/json') ? await res.json() : await res.text();
    return { status: res.status, ok: res.ok, body };
  }

  const results = [];
  function assert(name, condition, details = '') {
    results.push({ name, passed: !!condition, details });
    console.log(`[${condition ? 'PASS' : 'FAIL'}] ${name}${details ? ` -> ${details}` : ''}`);
  }

  try {
    // 1. GET /api/predict/cutoff
    console.log('--- 1. Testing GET /api/predict/cutoff ---');
    const p1 = await get('/api/predict/cutoff?instituteName=Indian%20Institute%20of%20Technology%20Bhubaneswar&branch=Computer%20Science&seatCategory=OPEN&quota=AI&genderPool=Gender-Neutral');
    assert(
      'Cutoff prediction endpoint returns valid trajectory & range',
      p1.ok && p1.body.success && p1.body.historicalRounds.length >= 3 && p1.body.prediction.predictedRange,
      `historical rounds: ${p1.body.historicalRounds.length}, expected: ${p1.body.prediction?.predictedRange?.expected}, confidence: ${p1.body.prediction?.confidenceLevel}`
    );

    // 2. Error handling: missing instituteName
    const p2 = await get('/api/predict/cutoff');
    assert(
      'Missing instituteName returns 400',
      p2.status === 400 && p2.body.success === false,
      `status: ${p2.status}, message: ${p2.body.message}`
    );

    // 3. GET /api/recommendations/counsel (CRL Profile)
    console.log('\n--- 2. Testing Counselling Recommendations (GET & POST) ---');
    const r1 = await get('/api/recommendations/counsel?rank=4000&rankType=CRL&seatCategory=OPEN&quota=AI&genderPool=Gender-Neutral&instituteType=IIT');
    assert(
      'GET /api/recommendations/counsel returns categorized tiers for CRL 4,000',
      r1.ok && r1.body.success && (r1.body.summary.safeCount + r1.body.summary.targetCount + r1.body.summary.reachCount > 0),
      `Safe: ${r1.body.summary.safeCount}, Target: ${r1.body.summary.targetCount}, Reach: ${r1.body.summary.reachCount}`
    );

    // Verify all recommended colleges strictly match allotment parameters
    const allTiers = [...(r1.body.tiers?.safe || []), ...(r1.body.tiers?.target || []), ...(r1.body.tiers?.reach || [])];
    const strictMatch = allTiers.every(item =>
      item.seatCategory === 'OPEN' &&
      item.quota === 'AI' &&
      item.genderPool === 'Gender-Neutral' &&
      item.rankType === 'CRL' &&
      item.instituteType === 'IIT'
    );
    assert(
      'Strict parameter matching verified (no mixing of category/quota/genderPool/rankType)',
      strictMatch,
      `verified across all ${allTiers.length} returned colleges`
    );

    // 4. POST /api/recommendations/counsel (Category Rank Profile)
    const r2 = await post('/api/recommendations/counsel', {
      rank: 1200,
      rankType: 'Category Rank',
      seatCategory: 'OBC-NCL',
      quota: 'AI',
      genderPool: 'Gender-Neutral',
      instituteType: 'IIT'
    });
    assert(
      'POST /api/recommendations/counsel returns recommendations for Category Rank 1,200',
      r2.ok && r2.body.success && (r2.body.summary.safeCount + r2.body.summary.targetCount + r2.body.summary.reachCount > 0),
      `Safe: ${r2.body.summary.safeCount}, Target: ${r2.body.summary.targetCount}, Reach: ${r2.body.summary.reachCount}`
    );

    // 5. GET /api/predict/backtest
    console.log('\n--- 3. Testing Historical Backtesting Endpoint ---');
    const b1 = await get('/api/predict/backtest?trainingRound=2');
    assert(
      'Backtesting endpoint runs empirical evaluation against MongoDB Atlas data',
      b1.ok && b1.body.success && b1.body.backtest.hitRate >= 80,
      `evaluated ${b1.body.backtest.totalEvaluated} trajectories, hitRate: ${b1.body.backtest.hitRate}%, MAPE: ${b1.body.backtest.meanAbsolutePercentageError}%`
    );

    const totalCount = results.length;
    const passedCount = results.filter(r => r.passed).length;
    console.log(`\n==============================================`);
    console.log(`Prediction Endpoints Results: ${passedCount} of ${totalCount} PASSED`);
    console.log(`==============================================`);

    if (passedCount < totalCount) {
      process.exitCode = 1;
    }
  } catch (err) {
    console.error('Test execution error:', err);
    process.exitCode = 1;
  } finally {
    server.close();
    await mongoose.disconnect();
  }
}

testPredictionEndpoints();
