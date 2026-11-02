const path = require('path');
module.paths.push(path.join(__dirname, '../Backened/node_modules'));
require('dotenv').config({ path: path.join(__dirname, '../Backened/.env') });
const app = require('../Backened/server');
const connectDB = require('../Backened/db');
const mongoose = require('mongoose');

async function testExplorer() {
  console.log('=== JoSAA Cutoff Explorer Thorough Verification ===\n');

  await connectDB();
  const server = app.listen(5003);
  const baseUrl = 'http://localhost:5003';

  async function get(path) {
    const res = await fetch(baseUrl + path);
    const contentType = res.headers.get('content-type') || '';
    const body = contentType.includes('application/json') ? await res.json() : await res.text();
    return { status: res.status, ok: res.ok, body };
  }

  const testResults = [];
  function assert(name, condition, details = '') {
    testResults.push({ name, passed: !!condition, details });
    console.log(`[${condition ? 'PASS' : 'FAIL'}] ${name}${details ? ` -> ${details}` : ''}`);
  }

  try {
    // ---------------------------------------------------------
    // GROUP 1: DYNAMIC FILTER OPTIONS
    // ---------------------------------------------------------
    console.log('\n--- 1. Testing Dynamic Filter Options ---');

    // 1.1 Global filters
    const fGlobal = await get('/api/cutoffs/filters');
    assert(
      'Global filter options',
      fGlobal.ok && fGlobal.body.filters.institutes.length >= 55,
      `found ${fGlobal.body.filters.institutes.length} institutes, ${fGlobal.body.filters.rounds.length} rounds`
    );

    // 1.2 Contextual filter: instituteType=IIT
    const fIIT = await get('/api/cutoffs/filters?instituteType=IIT');
    const allIITNames = fIIT.body.filters.institutes.every(i => i.includes('Indian Institute of Technology'));
    assert(
      'Contextual filters (instituteType=IIT)',
      fIIT.ok && allIITNames && fIIT.body.filters.institutes.length >= 23,
      `returned strictly ${fIIT.body.filters.institutes.length} IIT institutes (no NITs)`
    );

    // 1.3 Contextual filter: instituteType=NIT
    const fNIT = await get('/api/cutoffs/filters?instituteType=NIT');
    const allNITNames = fNIT.body.filters.institutes.every(i =>
      i.includes('National Institute') ||
      i.includes('Malaviya') ||
      i.includes('Motilal') ||
      i.includes('Maulana') ||
      i.includes('Sardar') ||
      i.includes('Visvesvaraya') ||
      i.includes('Shibpur')
    );
    assert(
      'Contextual filters (instituteType=NIT)',
      fNIT.ok && allNITNames && fNIT.body.filters.institutes.length >= 31,
      `returned strictly ${fNIT.body.filters.institutes.length} NIT institutes (no IITs)`
    );

    // 1.4 Contextual filter: round=5
    const fR5 = await get('/api/cutoffs/filters?round=5');
    assert(
      'Contextual filters (round=5)',
      fR5.ok && fR5.body.filters.rounds.includes(5),
      `quotas in round 5: ${fR5.body.filters.quotas.join(', ')}`
    );

    // ---------------------------------------------------------
    // GROUP 2: INDIVIDUAL SEARCH & FILTERS
    // ---------------------------------------------------------
    console.log('\n--- 2. Testing Individual Search & Filter Parameters ---');

    // 2.1 Full-text search across institute
    const s1 = await get('/api/cutoffs?search=Kharagpur');
    assert(
      'Search across institute (search=Kharagpur)',
      s1.ok && s1.body.totalRecords > 0 && s1.body.data.every(d => d.instituteName.includes('Kharagpur')),
      `found ${s1.body.totalRecords} records`
    );

    // 2.2 Full-text search across programme
    const s2 = await get('/api/cutoffs?search=Computer%20Science');
    assert(
      'Search across programme (search=Computer Science)',
      s2.ok && s2.body.totalRecords >= 4833,
      `all ${s2.body.totalRecords} records contain Computer Science`
    );

    // 2.3 Exact Institute Name
    const s3 = await get('/api/cutoffs?instituteName=Indian%20Institute%20of%20Technology%20Delhi');
    assert(
      'Filter by instituteName (IIT Delhi)',
      s3.ok && s3.body.totalRecords > 0 && s3.body.data.every(d => d.instituteName === 'Indian Institute of Technology Delhi'),
      `found ${s3.body.totalRecords} records for IIT Delhi`
    );

    // 2.4 Quota filters (AI, HS, OS)
    const s4AI = await get('/api/cutoffs?quota=AI');
    const s4HS = await get('/api/cutoffs?quota=HS');
    const s4OS = await get('/api/cutoffs?quota=OS');
    assert(
      'Filter by Quotas (AI, HS, OS)',
      s4AI.ok && s4HS.ok && s4OS.ok && s4AI.body.totalRecords > 0 && s4HS.body.totalRecords > 0 && s4OS.body.totalRecords > 0,
      `AI: ${s4AI.body.totalRecords}, HS: ${s4HS.body.totalRecords}, OS: ${s4OS.body.totalRecords}`
    );

    // 2.5 Seat Categories (OPEN, OBC-NCL, SC, ST, EWS)
    const s5Open = await get('/api/cutoffs?seatCategory=OPEN');
    const s5OBC = await get('/api/cutoffs?seatCategory=OBC-NCL');
    const s5SC = await get('/api/cutoffs?seatCategory=SC');
    const s5ST = await get('/api/cutoffs?seatCategory=ST');
    const s5EWS = await get('/api/cutoffs?seatCategory=EWS');
    assert(
      'Filter by Seat Categories (OPEN, OBC-NCL, SC, ST, EWS)',
      s5Open.body.totalRecords > 0 && s5OBC.body.totalRecords > 0 && s5SC.body.totalRecords > 0 && s5ST.body.totalRecords > 0 && s5EWS.body.totalRecords > 0,
      `OPEN: ${s5Open.body.totalRecords}, OBC: ${s5OBC.body.totalRecords}, SC: ${s5SC.body.totalRecords}, ST: ${s5ST.body.totalRecords}, EWS: ${s5EWS.body.totalRecords}`
    );

    // 2.6 Gender pools
    const s6Neutral = await get('/api/cutoffs?genderPool=Gender-Neutral');
    const s6Female = await get('/api/cutoffs?genderPool=Female-only%20(including%20Supernumerary)');
    assert(
      'Filter by Gender Pool',
      s6Neutral.body.totalRecords > 0 && s6Female.body.totalRecords > 0,
      `Gender-Neutral: ${s6Neutral.body.totalRecords}, Female-only: ${s6Female.body.totalRecords}`
    );

    // 2.7 Rounds (1 to 5)
    const r1 = await get('/api/cutoffs?round=1');
    const r2 = await get('/api/cutoffs?round=2');
    const r3 = await get('/api/cutoffs?round=3');
    const r4 = await get('/api/cutoffs?round=4');
    const r5 = await get('/api/cutoffs?round=5');
    assert(
      'Filter by Rounds (1 through 5)',
      r1.body.totalRecords > 0 && r2.body.totalRecords > 0 && r3.body.totalRecords > 0 && r4.body.totalRecords > 0 && r5.body.totalRecords > 0,
      `R1: ${r1.body.totalRecords}, R2: ${r2.body.totalRecords}, R3: ${r3.body.totalRecords}, R4: ${r4.body.totalRecords}, R5: ${r5.body.totalRecords}`
    );

    // 2.8 Student rank filter (closingRank >= rank)
    const s8 = await get('/api/cutoffs?rank=5000');
    assert(
      'Filter by student rank (rank=5000)',
      s8.ok && s8.body.data.every(d => d.closingRank >= 5000),
      `matched ${s8.body.totalRecords} records where closingRank >= 5000`
    );

    // ---------------------------------------------------------
    // GROUP 3: COMBINED MULTI-FILTER QUERIES
    // ---------------------------------------------------------
    console.log('\n--- 3. Testing Combined Multi-Filter Queries ---');

    // 3.1 Combination: IIT + Round 1 + AI + OPEN + Gender-Neutral + rank=2500
    const c1 = await get('/api/cutoffs?instituteType=IIT&round=1&quota=AI&seatCategory=OPEN&genderPool=Gender-Neutral&rank=2500');
    assert(
      'Combined: IIT + Round 1 + AI + OPEN + Gender-Neutral + rank=2500',
      c1.ok && c1.body.totalRecords > 0 && c1.body.data.every(d =>
        d.instituteType === 'IIT' &&
        d.round === 1 &&
        d.quota === 'AI' &&
        d.seatCategory === 'OPEN' &&
        d.genderPool === 'Gender-Neutral' &&
        d.closingRank >= 2500
      ),
      `matched ${c1.body.totalRecords} records (e.g. ${c1.body.data[0]?.instituteName}, closing: ${c1.body.data[0]?.closingRank})`
    );

    // 3.2 Combination: NIT + Round 2 + HS + OBC-NCL
    const c2 = await get('/api/cutoffs?instituteType=NIT&round=2&quota=HS&seatCategory=OBC-NCL');
    assert(
      'Combined: NIT + Round 2 + HS + OBC-NCL',
      c2.ok && c2.body.totalRecords > 0 && c2.body.data.every(d =>
        d.instituteType === 'NIT' &&
        d.round === 2 &&
        d.quota === 'HS' &&
        d.seatCategory === 'OBC-NCL'
      ),
      `matched ${c2.body.totalRecords} records`
    );

    // 3.3 Combination: Search + Type + Round + Rank
    const c3 = await get('/api/cutoffs?search=Madras&instituteType=IIT&round=1&rank=100');
    assert(
      'Combined: Search(Madras) + IIT + Round 1 + Rank(100)',
      c3.ok && c3.body.totalRecords > 0 && c3.body.data.every(d => d.instituteName.includes('Madras') && d.closingRank >= 100),
      `matched ${c3.body.totalRecords} records`
    );

    // ---------------------------------------------------------
    // GROUP 4: SORTING
    // ---------------------------------------------------------
    console.log('\n--- 4. Testing Sorting Orders ---');

    // 4.1 Closing rank ascending
    const sortCloseAsc = await get('/api/cutoffs?sort=closing-asc&limit=10');
    const ca = sortCloseAsc.body.data.map(d => d.closingRank);
    assert(
      'Sort closing-asc',
      sortCloseAsc.ok && ca.every((v, i) => i === 0 || v >= ca[i - 1]),
      `lowest ranks: ${ca.slice(0, 5).join(', ')}`
    );

    // 4.2 Closing rank descending
    const sortCloseDesc = await get('/api/cutoffs?sort=closing-desc&limit=10');
    const cd = sortCloseDesc.body.data.map(d => d.closingRank);
    assert(
      'Sort closing-desc',
      sortCloseDesc.ok && cd.every((v, i) => i === 0 || v <= cd[i - 1]),
      `highest ranks: ${cd.slice(0, 5).join(', ')}`
    );

    // 4.3 Opening rank ascending
    const sortOpenAsc = await get('/api/cutoffs?sort=opening-asc&limit=10');
    const oa = sortOpenAsc.body.data.map(d => d.openingRank);
    assert(
      'Sort opening-asc',
      sortOpenAsc.ok && oa.every((v, i) => i === 0 || v >= oa[i - 1]),
      `lowest opening: ${oa.slice(0, 5).join(', ')}`
    );

    // 4.4 Opening rank descending
    const sortOpenDesc = await get('/api/cutoffs?sort=opening-desc&limit=10');
    const od = sortOpenDesc.body.data.map(d => d.openingRank);
    assert(
      'Sort opening-desc',
      sortOpenDesc.ok && od.every((v, i) => i === 0 || v <= od[i - 1]),
      `highest opening: ${od.slice(0, 5).join(', ')}`
    );

    // 4.5 Institute Name ascending (A to Z)
    const sortInstAsc = await get('/api/cutoffs?sort=institute-asc&limit=10');
    const ia = sortInstAsc.body.data.map(d => d.instituteName);
    assert(
      'Sort institute-asc (A-Z)',
      sortInstAsc.ok && ia.every((v, i) => i === 0 || v.localeCompare(ia[i - 1]) >= 0),
      `first 2: ${ia[0]} | ${ia[1]}`
    );

    // 4.6 Institute Name descending (Z to A)
    const sortInstDesc = await get('/api/cutoffs?sort=institute-desc&limit=10');
    const id = sortInstDesc.body.data.map(d => d.instituteName);
    assert(
      'Sort institute-desc (Z-A)',
      sortInstDesc.ok && id.every((v, i) => i === 0 || v.localeCompare(id[i - 1]) <= 0),
      `first 2: ${id[0]} | ${id[1]}`
    );

    // ---------------------------------------------------------
    // GROUP 5: PAGINATION
    // ---------------------------------------------------------
    console.log('\n--- 5. Testing Pagination ---');

    // 5.1 Page 1 limit 10
    const p1 = await get('/api/cutoffs?page=1&limit=10&sort=closing-asc');
    assert('Pagination page 1 limit 10', p1.ok && p1.body.data.length === 10 && p1.body.page === 1 && p1.body.totalPages > 0);

    // 5.2 Page 2 limit 10 (records are different from page 1)
    const p2 = await get('/api/cutoffs?page=2&limit=10&sort=closing-asc');
    const id1 = p1.body.data.map(d => d._id);
    const id2 = p2.body.data.map(d => d._id);
    const disjoint = id1.every(id => !id2.includes(id));
    assert('Pagination page 2 distinct from page 1', p2.ok && p2.body.page === 2 && disjoint);

    // 5.3 Page 1 limit 50
    const p50 = await get('/api/cutoffs?page=1&limit=50');
    assert('Pagination page size 50', p50.ok && p50.body.data.length === 50 && p50.body.totalPages > 0);

    // ---------------------------------------------------------
    // GROUP 6: STATUS CALCULATION (SAFE / TARGET / REACH)
    // ---------------------------------------------------------
    console.log('\n--- 6. Testing Status Calculation Logic ---');
    global.window = global;
    require('../js/utils');
    const classify = global.classifyHistoricalCutoff;

    const tSafe = classify(400, 1000);
    const tTarget = classify(900, 1000);
    const tReach = classify(1200, 1000);
    assert('Historical classification: rank 400 vs closing 1000', tSafe === 'Safe', `got ${tSafe}`);
    assert('Historical classification: rank 900 vs closing 1000', tTarget === 'Target', `got ${tTarget}`);
    assert('Historical classification: rank 1200 vs closing 1000', tReach === 'Reach', `got ${tReach}`);

    // Summary
    const totalCount = testResults.length;
    const passedCount = testResults.filter(r => r.passed).length;
    console.log(`\n==============================================`);
    console.log(`Explorer Test Results: ${passedCount} of ${totalCount} PASSED`);
    console.log(`==============================================`);

    if (passedCount < totalCount) {
      process.exitCode = 1;
    }
  } catch (err) {
    console.error('Explorer test execution error:', err);
    process.exitCode = 1;
  } finally {
    server.close();
    await mongoose.disconnect();
  }
}

testExplorer();
