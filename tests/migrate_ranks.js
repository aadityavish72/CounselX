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
  return { instituteType: 'GFTI', examRankType: 'JEE_MAIN' };
}

function inferCrlOrCategory(seatType, rankType) {
  if (rankType && String(rankType).trim() && !['JEE_ADVANCED', 'JEE_MAIN'].includes(String(rankType).trim())) {
    return String(rankType).trim();
  }
  const s = String(seatType || '').toUpperCase();
  if (s.includes('PWD')) return 'PwD Rank within Respective Category';
  if (s === 'OPEN') return 'CRL';
  return 'Category Rank';
}

async function migrate() {
  await connectDB();
  console.log('Starting safe normalization of cutoff records in MongoDB Atlas...');

  const total = await Cutoff.countDocuments();
  console.log(`Total documents in collection: ${total}`);

  // Fetch all documents in batches
  const batchSize = 1000;
  let updated = 0;
  let cursor = Cutoff.find({}).cursor();

  const bulkOps = [];
  for await (const doc of cursor) {
    const instName = doc.instituteName || doc.institute;
    const classification = classifyInstitute(instName);
    
    if (!classification) {
      console.warn(`Could not classify: "${instName}", skipping document ${doc._id}`);
      continue;
    }

    const { instituteType, examRankType } = classification;
    const crlOrCategory = inferCrlOrCategory(doc.seatType || doc.seatCategory, doc.rankType);

    // Only update if missing or different
    const needsUpdate =
      doc.instituteType !== instituteType ||
      doc.examRankType !== examRankType ||
      !doc.rankType ||
      doc.rankType === '' ||
      !doc.instituteName ||
      !doc.programName;

    if (needsUpdate) {
      bulkOps.push({
        updateOne: {
          filter: { _id: doc._id },
          update: {
            $set: {
              instituteType,
              examRankType,
              rankType: crlOrCategory,
              instituteName: instName,
              programName: doc.programName || doc.academicProgram
            }
          }
        }
      });
    }

    if (bulkOps.length >= batchSize) {
      const res = await Cutoff.bulkWrite(bulkOps);
      updated += res.modifiedCount;
      bulkOps.length = 0;
      console.log(`Processed batch, modified: ${updated} records...`);
    }
  }

  if (bulkOps.length > 0) {
    const res = await Cutoff.bulkWrite(bulkOps);
    updated += res.modifiedCount;
  }

  console.log(`Normalization complete. Total records updated: ${updated} of ${total}`);

  // Verify counts
  const iitCount = await Cutoff.countDocuments({ instituteType: 'IIT', examRankType: 'JEE_ADVANCED' });
  const nitCount = await Cutoff.countDocuments({ instituteType: 'NIT', examRankType: 'JEE_MAIN' });
  const missingCount = await Cutoff.countDocuments({ $or: [{ instituteType: null }, { examRankType: null }] });

  console.log(`Post-migration verification:`);
  console.log(`- IIT records (JEE_ADVANCED): ${iitCount}`);
  console.log(`- NIT records (JEE_MAIN): ${nitCount}`);
  console.log(`- Missing instituteType or examRankType: ${missingCount}`);

  process.exit(0);
}

migrate().catch(e => { console.error('Migration failed:', e); process.exit(1); });
