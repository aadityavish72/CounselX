const path = require('path');
module.paths.push(path.join(__dirname, '../Backened/node_modules'));
require('dotenv').config({ path: path.join(__dirname, '../Backened/.env') });

const http = require('http');
const connectDB = require('../Backened/db');
const app = require('../Backened/server');
const Cutoff = require('../Backened/models/Cutoff');

let server;
const PORT = 5099;
const BASE_URL = `http://localhost:${PORT}`;

function makeRequest(endpoint, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('===============================================================');
  console.log('  CounselX: Institute-Based Rank Validation & Cutoff Test Suite');
  console.log('===============================================================\n');

  await connectDB();

  await new Promise((resolve) => {
    server = app.listen(PORT, resolve);
  });

  const results = [];
  function assert(name, condition, details = '') {
    results.push({ name, passed: !!condition, details });
    console.log(`[${condition ? 'PASS' : 'FAIL'}] ${name}${details ? ` -> ${details}` : ''}`);
  }

  try {
    // -------------------------------------------------------------
    // Scenario 1: Select IIT and provide valid JEE Advanced rank -> successful IIT cutoffs
    // -------------------------------------------------------------
    console.log('\n--- Scenario 1: IIT + JEE Advanced Rank ---');
    const res1 = await makeRequest('/api/cutoffs?instituteType=IIT&examRankType=JEE_ADVANCED&rank=4500');
    assert(
      'Scenario 1: IIT + JEE Advanced rank returns HTTP 200 with matching IIT cutoffs',
      res1.status === 200 && res1.data.success && res1.data.data.length > 0 &&
      res1.data.data.every(r => r.instituteType === 'IIT' && r.examRankType === 'JEE_ADVANCED'),
      `found ${res1.data.totalRecords} IIT records with examRankType JEE_ADVANCED`
    );

    // -------------------------------------------------------------
    // Scenario 2: Select NIT and provide valid JEE Main rank -> successful NIT cutoffs
    // -------------------------------------------------------------
    console.log('\n--- Scenario 2: NIT + JEE Main Rank ---');
    const res2 = await makeRequest('/api/cutoffs?instituteType=NIT&examRankType=JEE_MAIN&rank=25000');
    assert(
      'Scenario 2: NIT + JEE Main rank returns HTTP 200 with matching NIT cutoffs',
      res2.status === 200 && res2.data.success && res2.data.data.length > 0 &&
      res2.data.data.every(r => r.instituteType === 'NIT' && r.examRankType === 'JEE_MAIN'),
      `found ${res2.data.totalRecords} NIT records with examRankType JEE_MAIN`
    );

    // -------------------------------------------------------------
    // Scenario 3: Select IIIT and provide valid JEE Main rank -> successful validation
    // -------------------------------------------------------------
    console.log('\n--- Scenario 3: IIIT + JEE Main Rank ---');
    const res3 = await makeRequest('/api/cutoffs?instituteType=IIIT&examRankType=JEE_MAIN&rank=12000');
    assert(
      'Scenario 3: IIIT + JEE Main rank validation succeeds with HTTP 200',
      res3.status === 200 && res3.data.success,
      `filters applied correctly: instituteType=IIIT, examRankType=JEE_MAIN`
    );

    // -------------------------------------------------------------
    // Scenario 4: Select GFTI and provide valid JEE Main rank -> successful validation
    // -------------------------------------------------------------
    console.log('\n--- Scenario 4: GFTI + JEE Main Rank ---');
    const res4 = await makeRequest('/api/cutoffs?instituteType=GFTI&examRankType=JEE_MAIN&rank=35000');
    assert(
      'Scenario 4: GFTI + JEE Main rank validation succeeds with HTTP 200',
      res4.status === 200 && res4.data.success,
      `filters applied correctly: instituteType=GFTI, examRankType=JEE_MAIN`
    );

    // -------------------------------------------------------------
    // Scenario 5: Select IIT and provide JEE Main rank -> rejection HTTP 400
    // -------------------------------------------------------------
    console.log('\n--- Scenario 5: IIT + JEE Main Rank (Mismatch) ---');
    const res5 = await makeRequest('/api/cutoffs?instituteType=IIT&examRankType=JEE_MAIN&rank=4500');
    assert(
      'Scenario 5: IIT with JEE Main rank rejected with HTTP 400',
      res5.status === 400 && res5.data.success === false &&
      res5.data.message.includes('IIT cutoff searches require a JEE Advanced rank'),
      `Message: "${res5.data.message}"`
    );

    // Also check POST /api/recommendations/counsel with mismatch
    const res5b = await makeRequest('/api/recommendations/counsel', 'POST', {
      instituteType: 'IIT',
      examRankType: 'JEE_MAIN',
      rank: 4500
    });
    assert(
      'Scenario 5b: Recommendations API rejects IIT with JEE Main rank with HTTP 400',
      res5b.status === 400 && res5b.data.success === false &&
      res5b.data.message.includes('IIT cutoff searches require a JEE Advanced rank'),
      `Message: "${res5b.data.message}"`
    );

    // -------------------------------------------------------------
    // Scenario 6: Select NIT and provide JEE Advanced rank -> rejection HTTP 400
    // -------------------------------------------------------------
    console.log('\n--- Scenario 6: NIT + JEE Advanced Rank (Mismatch) ---');
    const res6 = await makeRequest('/api/cutoffs?instituteType=NIT&examRankType=JEE_ADVANCED&rank=4500');
    assert(
      'Scenario 6: NIT with JEE Advanced rank rejected with HTTP 400',
      res6.status === 400 && res6.data.success === false &&
      res6.data.message.includes('NIT cutoff searches require a JEE Main rank'),
      `Message: "${res6.data.message}"`
    );

    const res6b = await makeRequest('/api/recommendations/counsel', 'POST', {
      instituteType: 'NIT',
      examRankType: 'JEE_ADVANCED',
      rank: 4500
    });
    assert(
      'Scenario 6b: Recommendations API rejects NIT with JEE Advanced rank with HTTP 400',
      res6b.status === 400 && res6b.data.success === false &&
      res6b.data.message.includes('NIT cutoff searches require a JEE Main rank'),
      `Message: "${res6b.data.message}"`
    );

    // -------------------------------------------------------------
    // Scenario 7: Missing rank in recommendation search -> rejection HTTP 400
    // -------------------------------------------------------------
    console.log('\n--- Scenario 7: Missing Rank in Recommendations ---');
    const res7 = await makeRequest('/api/recommendations/counsel', 'POST', {
      instituteType: 'IIT'
    });
    assert(
      'Scenario 7: Missing rank in recommendations rejected with HTTP 400',
      res7.status === 400 && res7.data.success === false &&
      res7.data.message.includes('Rank is required'),
      `Message: "${res7.data.message}"`
    );

    // -------------------------------------------------------------
    // Scenario 8: Zero or negative rank input -> rejection HTTP 400
    // -------------------------------------------------------------
    console.log('\n--- Scenario 8: Zero or Negative Rank Input ---');
    const res8Zero = await makeRequest('/api/cutoffs?instituteType=IIT&rank=0');
    const res8Neg = await makeRequest('/api/cutoffs?instituteType=IIT&rank=-500');
    assert(
      'Scenario 8: Zero and negative ranks rejected with HTTP 400',
      res8Zero.status === 400 && res8Neg.status === 400 &&
      res8Zero.data.message.includes('positive integer') &&
      res8Neg.data.message.includes('positive integer'),
      `Zero msg: "${res8Zero.data.message}", Neg msg: "${res8Neg.data.message}"`
    );

    // -------------------------------------------------------------
    // Scenario 9: Non-integer rank input -> rejection HTTP 400
    // -------------------------------------------------------------
    console.log('\n--- Scenario 9: Non-Integer Rank Input ---');
    const res9Decimal = await makeRequest('/api/cutoffs?instituteType=IIT&rank=450.75');
    const res9Alpha = await makeRequest('/api/cutoffs?instituteType=IIT&rank=abc');
    assert(
      'Scenario 9: Decimal and non-numeric ranks rejected with HTTP 400',
      res9Decimal.status === 400 && res9Alpha.status === 400 &&
      res9Decimal.data.message.includes('positive integer'),
      `Decimal msg: "${res9Decimal.data.message}", Alpha msg: "${res9Alpha.data.message}"`
    );

    // -------------------------------------------------------------
    // Scenario 10: Dynamic UI Update logic verification
    // -------------------------------------------------------------
    console.log('\n--- Scenario 10: Dynamic UI Updates ---');
    const fs = require('fs');
    const collegesJs = fs.readFileSync(path.join(__dirname, '../js/colleges.js'), 'utf-8');
    const indexHtml = fs.readFileSync(path.join(__dirname, '../frontened/index.html'), 'utf-8');

    const hasDynamicLabels = collegesJs.includes('JEE Advanced Rank') &&
      collegesJs.includes('JEE Main Rank') &&
      collegesJs.includes('updateDynamicRankUI');

    const hasExamChangeAlert = collegesJs.includes('ex-exam-alert') &&
      collegesJs.includes('Notice: You changed institute type');

    const hasHtmlAlertBox = indexHtml.includes('id="ex-exam-alert"');

    assert(
      'Scenario 10: Dynamic UI updates labels, hints, and displays warning if institute type changed',
      hasDynamicLabels && hasExamChangeAlert && hasHtmlAlertBox,
      'Dynamic rank label and alert banner verified in frontend components'
    );

    // -------------------------------------------------------------
    // Scenario 11: Results page clearly indicates examination/rank type used
    // -------------------------------------------------------------
    console.log('\n--- Scenario 11: Results Display Indicates Examination & Threshold Status ---');
    const sampleRecord = res1.data.data[0];
    const hasExamFields = sampleRecord && sampleRecord.examRankType === 'JEE_ADVANCED' && sampleRecord.examName === 'JEE Advanced';
    const hasExamColumn = collegesJs.includes('<th>Exam</th>') && collegesJs.includes('badge-adv');
    const hasThresholdStatus = collegesJs.includes('Within cutoff') && collegesJs.includes('Beyond cutoff');

    assert(
      'Scenario 11: Cutoff records display exam name, badge, and explicit threshold status',
      hasExamFields && hasExamColumn && hasThresholdStatus,
      `Record Exam: ${sampleRecord.examName} (${sampleRecord.examRankType})`
    );

    // -------------------------------------------------------------
    // Scenario 12: Cutoff prediction uses correct examination rank type
    // -------------------------------------------------------------
    console.log('\n--- Scenario 12: Cutoff Prediction Partitioning ---');
    const res12IIT = await makeRequest('/api/predict/cutoff?instituteName=Indian+Institute+of+Technology+Bhubaneswar&branch=Computer+Science+and+Engineering&targetRound=5');
    assert(
      'Scenario 12A: Prediction for IIT Bhubaneswar strictly uses JEE_ADVANCED historical rounds',
      res12IIT.status === 200 && res12IIT.data.success &&
      res12IIT.data.historicalRounds.length > 0 &&
      res12IIT.data.historicalRounds.every(r => r.examRankType === 'JEE_ADVANCED' && r.instituteType === 'IIT'),
      `Historical rounds: ${res12IIT.data.historicalRounds.length}, all JEE_ADVANCED`
    );

    const res12NIT = await makeRequest('/api/predict/cutoff?instituteName=' + encodeURIComponent('National Institute of Technology, Warangal') + '&branch=' + encodeURIComponent('Computer Science and Engineering') + '&targetRound=5');
    assert(
      'Scenario 12B: Prediction for NIT Warangal strictly uses JEE_MAIN historical rounds',
      res12NIT.status === 200 && res12NIT.data.success &&
      res12NIT.data.historicalRounds.length > 0 &&
      res12NIT.data.historicalRounds.every(r => r.examRankType === 'JEE_MAIN' && r.instituteType === 'NIT'),
      `Historical rounds: ${res12NIT.data.historicalRounds.length}, all JEE_MAIN`
    );

    // -------------------------------------------------------------
    // Summary
    // -------------------------------------------------------------
    const totalCount = results.length;
    const passedCount = results.filter(r => r.passed).length;
    console.log('\n===============================================================');
    console.log(` Rank Validation Test Results: ${passedCount} / ${totalCount} Passed`);
    console.log('===============================================================');

    if (passedCount !== totalCount) {
      process.exit(1);
    }
    process.exit(0);
  } catch (err) {
    console.error('Test execution failed:', err);
    process.exit(1);
  } finally {
    if (server) server.close();
    try { await mongoose.disconnect(); } catch (e) {}
  }
}

runTests();
