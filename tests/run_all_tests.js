const path = require('path');
module.paths.push(path.join(__dirname, '../Backened/node_modules'));

const { spawnSync } = require('child_process');

console.log('===========================================================');
console.log('        CounselX Master Verification & Test Runner         ');
console.log('===========================================================\n');

const testSuites = [
  { name: 'Institute-Based Rank Validation Suite', file: 'tests/test_rank_validation.js' },
  { name: 'JoSAA Cutoff Explorer Suite', file: 'tests/test_explorer.js' },
  { name: 'Live Integration & API Regression Suite', file: 'tests/test_integration.js' },
  { name: 'Cutoff Prediction & Counselling Engine Suite', file: 'tests/test_counselling_engine.js' },
  { name: 'Prediction & Counselling API Endpoints Suite', file: 'tests/test_prediction_endpoints.js' },
  { name: 'Module B: Advanced Recommendation System Suite', file: 'tests/test_advanced_recommendations.js' },
  { name: 'Full Headless Chromium E2E Browser Audit', file: 'tests/test_e2e_audit.js' }
];

let totalFailed = 0;

for (const suite of testSuites) {
  console.log(`\n>>> Running: ${suite.name} (${suite.file})`);
  const result = spawnSync('node', [suite.file], {
    stdio: 'inherit',
    cwd: path.join(__dirname, '..'),
    env: process.env
  });

  if (result.status !== 0) {
    console.error(`FAILED: ${suite.name} exited with status ${result.status}`);
    totalFailed++;
  } else {
    console.log(`PASSED: ${suite.name}`);
  }
}

console.log('\n===========================================================');
if (totalFailed === 0) {
  console.log(` ALL ${testSuites.length} TEST SUITES PASSED! `);
} else {
  console.error(` MASTER RUN COMPLETED WITH ${totalFailed} FAILED SUITE(S) `);
  process.exit(1);
}
console.log('===========================================================');
