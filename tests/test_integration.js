const path = require('path');
module.paths.push(path.join(__dirname, '../Backened/node_modules'));
require('dotenv').config({ path: path.join(__dirname, '../Backened/.env') });
const app = require('../Backened/server');
const connectDB = require('../Backened/db');
const mongoose = require('mongoose');

async function run() {
  console.log('=== Live Integration & API Verification ===\n');
  await connectDB();
  const server = app.listen(5002);
  const baseUrl = 'http://localhost:5002';

  async function get(path) {
    const res = await fetch(baseUrl + path);
    const contentType = res.headers.get('content-type') || '';
    const body = contentType.includes('application/json') ? await res.json() : await res.text();
    return { status: res.status, ok: res.ok, body };
  }

  const results = [];

  function record(name, passed, details = '') {
    results.push({ name, passed, details });
    console.log(`[${passed ? 'PASS' : 'FAIL'}] ${name}${details ? ` -> ${details}` : ''}`);
  }

  try {
    // 1. Health check
    const r1 = await get('/');
    record('Server health check (GET /)', r1.ok && r1.body.success, `message: ${r1.body.message}`);

    // 2. DB status
    const r2 = await get('/api/db-status');
    record('Database status (GET /api/db-status)', r2.ok && r2.body.totalDocuments >= 4833, `docs: ${r2.body.totalDocuments}, db: ${r2.body.database}`);

    // 3. Cutoff filters
    const r3 = await get('/api/cutoffs/filters');
    const f = r3.body.filters;
    record(
      'Filter metadata (GET /api/cutoffs/filters)',
      r3.ok && f.institutes.length > 50 && f.rounds.length === 5,
      `institutes: ${f.institutes.length}, rounds: ${f.rounds.join(',')}, categories: ${f.seatCategories.length}`
    );

    // 4. Default cutoff search
    const r4 = await get('/api/cutoffs?page=1&limit=20');
    record(
      'Explorer default cutoffs (GET /api/cutoffs)',
      r4.ok && r4.body.totalRecords >= 4833 && r4.body.data.length === 20,
      `total: ${r4.body.totalRecords}, page: ${r4.body.page}, count: ${r4.body.data.length}`
    );

    // 5. Institute Type filter: IIT
    const r5 = await get('/api/cutoffs?instituteType=IIT&round=1&limit=5');
    record(
      'Filter by instituteType=IIT',
      r5.ok && r5.body.totalRecords > 0 && r5.body.data.every(d => d.instituteType === 'IIT'),
      `matched: ${r5.body.totalRecords} records`
    );

    // 6. Institute Type filter: NIT
    const r6 = await get('/api/cutoffs?instituteType=NIT&round=2&limit=5');
    record(
      'Filter by instituteType=NIT',
      r6.ok && r6.body.totalRecords > 0 && r6.body.data.every(d => d.instituteType === 'NIT'),
      `matched: ${r6.body.totalRecords} records`
    );

    // 7. Full text search
    const r7 = await get('/api/cutoffs?search=Bombay&limit=5');
    record(
      'Full text search (search=Bombay)',
      r7.ok && r7.body.totalRecords > 0 && r7.body.data.some(d => d.instituteName.includes('Bombay')),
      `matched: ${r7.body.totalRecords} records`
    );

    // 8. Quota & Category filter
    const r8 = await get('/api/cutoffs?quota=AI&seatCategory=OPEN&limit=5');
    record(
      'Filter by quota=AI & seatCategory=OPEN',
      r8.ok && r8.body.totalRecords > 0 && r8.body.data.every(d => d.quota === 'AI' && d.seatCategory === 'OPEN'),
      `matched: ${r8.body.totalRecords} records`
    );

    // 9. Student rank filter (closingRank >= 3000)
    const r9 = await get('/api/cutoffs?rank=3000&limit=5');
    record(
      'Rank filter (rank=3000)',
      r9.ok && r9.body.totalRecords > 0 && r9.body.data.every(d => d.closingRank >= 3000),
      `matched: ${r9.body.totalRecords} records (all closingRank >= 3000)`
    );

    // 10. Sort by closing rank ascending
    const r10 = await get('/api/cutoffs?sort=closing-asc&limit=5');
    const ranksAsc = r10.body.data.map(d => d.closingRank);
    const isSortedAsc = ranksAsc.every((v, i) => i === 0 || v >= ranksAsc[i - 1]);
    record('Sort closing-asc', r10.ok && isSortedAsc, `ranks: ${ranksAsc.join(', ')}`);

    // 11. Sort by closing rank descending
    const r11 = await get('/api/cutoffs?sort=closing-desc&limit=5');
    const ranksDesc = r11.body.data.map(d => d.closingRank);
    const isSortedDesc = ranksDesc.every((v, i) => i === 0 || v <= ranksDesc[i - 1]);
    record('Sort closing-desc', r11.ok && isSortedDesc, `ranks: ${ranksDesc.join(', ')}`);

    // 12. Single cutoff lookup by ID
    const sampleId = r4.body.data[0]._id;
    const r12 = await get(`/api/cutoffs/${sampleId}`);
    record(
      `Single cutoff lookup (/api/cutoffs/${sampleId})`,
      r12.ok && r12.body.data && r12.body.data._id === sampleId,
      `institute: ${r12.body.data?.instituteName}, closing: ${r12.body.data?.closingRank}`
    );

    // 13. Dashboard summary
    const r13 = await get('/api/dashboard/summary');
    record(
      'Dashboard summary (/api/dashboard/summary)',
      r13.ok && r13.body.stats.totalRecords >= 4833 && r13.body.stats.totalInstitutes >= 55,
      `total: ${r13.body.stats.totalRecords}, institutes: ${r13.body.stats.totalInstitutes}, programmes: ${r13.body.stats.totalProgrammes}, years: ${r13.body.stats.totalYears}`
    );

    // 14. Error handling: invalid ObjectId
    const r14 = await get('/api/cutoffs/invalid-id-xyz');
    record(
      'Invalid ObjectId error handling (/api/cutoffs/invalid-id-xyz)',
      r14.status === 400 && r14.body.success === false,
      `status: ${r14.status}, message: ${r14.body.message}`
    );

    // 15. Error handling: invalid rank parameter
    const r15 = await get('/api/cutoffs?rank=-10');
    record(
      'Invalid rank query parameter error handling (/api/cutoffs?rank=-10)',
      r15.status === 400 && r15.body.success === false,
      `status: ${r15.status}, message: ${r15.body.message}`
    );

    // 16. Error handling: non-existent route
    const r16 = await get('/api/does-not-exist');
    record(
      'Unknown route 404 handler',
      r16.status === 404 && r16.body.success === false,
      `status: ${r16.status}, message: ${r16.body.message}`
    );

    const passedCount = results.filter(r => r.passed).length;
    console.log(`\nVerification complete: ${passedCount} of ${results.length} tests passed.`);

    if (passedCount < results.length) {
      process.exitCode = 1;
    }
  } catch (err) {
    console.error('Test execution failed:', err);
    process.exitCode = 1;
  } finally {
    server.close();
    await mongoose.disconnect();
  }
}

run();
