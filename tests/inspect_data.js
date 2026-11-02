const path = require('path');
module.paths.push(path.join(__dirname, '../Backened/node_modules'));
require('dotenv').config({ path: path.join(__dirname, '../Backened/.env') });
const connectDB = require('../Backened/db');
const Cutoff = require('../Backened/models/Cutoff');

async function inspect() {
  await connectDB();
  const types = await Cutoff.distinct('instituteType');
  const rankTypes = await Cutoff.distinct('rankType');
  console.log('Distinct instituteType:', types);
  console.log('Distinct rankType in DB:', rankTypes);
  
  for (const t of types) {
    const count = await Cutoff.countDocuments({ instituteType: t });
    const rTypes = await Cutoff.distinct('rankType', { instituteType: t });
    const sample = await Cutoff.findOne({ instituteType: t }).lean();
    console.log(`InstituteType: "${t}" (Count: ${count}) -> rankTypes: ${JSON.stringify(rTypes)}`);
    console.log('Sample instituteName:', sample?.instituteName || sample?.institute);
  }

  // Check records with null/missing instituteType
  const nullDocs = await Cutoff.find({ instituteType: { $in: [null, ''] } }).limit(10).lean();
  console.log('\nSample records with null/missing instituteType:');
  for (const doc of nullDocs) {
    console.log(`- Inst: "${doc.instituteName || doc.institute}", Prog: "${doc.programName || doc.academicProgram}", Type: "${doc.instituteType}"`);
  }

  // Check unique institute names across the database
  const allInstNames = await Cutoff.distinct('instituteName');
  const allAltInstNames = await Cutoff.distinct('institute');
  console.log(`\nUnique instituteName count: ${allInstNames.length}, Unique institute count: ${allAltInstNames.length}`);
  
  // Categorize all institutes by name pattern (IIT, NIT, IIIT, GFTI)
  const allNames = Array.from(new Set([...allInstNames, ...allAltInstNames].filter(Boolean)));
  console.log('\nTotal unique institute names in DB:', allNames.length);

  const breakdown = { IIT: 0, NIT: 0, IIIT: 0, GFTI: 0, other: [] };
  for (const name of allNames) {
    if (/Indian Institute of Technology\b|^IIT\b/i.test(name)) breakdown.IIT++;
    else if (/National Institute of Technology\b|^NIT\b/i.test(name)) breakdown.NIT++;
    else if (/Indian Institute of Information Technology\b|^IIIT\b/i.test(name)) breakdown.IIIT++;
    else breakdown.other.push(name);
  }
  console.log('Breakdown by name inference:', { IIT: breakdown.IIT, NIT: breakdown.NIT, IIIT: breakdown.IIIT, OtherCount: breakdown.other.length });
  console.log('Other institutes sample:', breakdown.other.slice(0, 10));

  // Check how normalizeCutoffDoc in server.js currently infers instituteType
  process.exit(0);
}

inspect().catch(err => {
  console.error(err);
  process.exit(1);
});
