const path = require('path');
module.paths.push(path.join(__dirname, '../Backened/node_modules'));
require('dotenv').config({ path: path.join(__dirname, '../Backened/.env') });
const connectDB = require('../Backened/db');
const Cutoff = require('../Backened/models/Cutoff');

function classifyInstitute(name) {
  if (!name) return null;
  const s = String(name).trim();
  if (/Indian Institute of Technology\b|^IIT\b/i.test(s) && !/Engineering Science/i.test(s)) {
    return { instituteType: 'IIT', examRankType: 'JEE_ADVANCED' };
  }
  if (
    /National Institute of Technology\b|^NIT\b/i.test(s) ||
    /Malaviya\b|Motilal\b|Maulana Azad\b|Sardar Vallabhbhai\b|Visvesvaraya\b/i.test(s) ||
    /Indian Institute of Engineering Science and Technology/i.test(s)
  ) {
    return { instituteType: 'NIT', examRankType: 'JEE_MAIN' };
  }
  if (/Indian Institute of Information Technology\b|^IIIT\b/i.test(s)) {
    return { instituteType: 'IIIT', examRankType: 'JEE_MAIN' };
  }
  // GFTI catch-all
  return { instituteType: 'GFTI', examRankType: 'JEE_MAIN' };
}

async function run() {
  await connectDB();
  const instNames = await Cutoff.distinct('instituteName');
  const altNames = await Cutoff.distinct('institute');
  const all = Array.from(new Set([...instNames, ...altNames].filter(Boolean))).sort();

  console.log(`Total unique institute names in Atlas: ${all.length}\n`);
  
  let unclassified = [];
  for (const name of all) {
    const classification = classifyInstitute(name);
    console.log(`[${classification.instituteType} -> ${classification.examRankType}] : ${name}`);
    if (!classification) unclassified.push(name);
  }

  console.log(`\nUnclassified: ${unclassified.length}`);
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
