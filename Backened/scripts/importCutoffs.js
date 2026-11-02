require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const path = require("path");
const connectDB = require("../db");
const Cutoff = require("../models/Cutoff");
const { importAllRawCutoffs } = require("../services/cutoffImportService");

async function main() {
  console.log("=== CounselX Cutoff Ingestion Pipeline ===");
  await connectDB();

  const dataDir = path.join(__dirname, "../../data/cutoffs/raw");
  console.log(`Starting import from directory: ${dataDir}`);

  const startTime = Date.now();
  const summary = await importAllRawCutoffs(dataDir);
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log("\n================ IMPORT REPORT ================");
  console.log(`Files Processed:      ${summary.totalFiles}`);
  console.log(`Total Records Read:   ${summary.totalRead}`);
  console.log(`Valid Records:        ${summary.validRecords}`);
  console.log(`New Records Inserted: ${summary.upsertedCount}`);
  console.log(`Records Updated:      ${summary.modifiedCount}`);
  console.log(`Records Skipped:      ${summary.skippedCount}`);
  console.log(`Duration:             ${duration}s`);

  if (summary.errors.length) {
    console.log("\nErrors Encountered:");
    summary.errors.forEach(e => console.error(" - " + e));
  }

  // Database Verification
  console.log("\n============= DATABASE VERIFICATION =============");
  const totalInDB = await Cutoff.countDocuments();
  const byYear = await Cutoff.aggregate([
    { $group: { _id: "$year", count: { $sum: 1 } } },
    { $sort: { _id: 1 } }
  ]);
  const byInstType = await Cutoff.aggregate([
    { $group: { _id: "$instituteType", count: { $sum: 1 } } },
    { $sort: { _id: 1 } }
  ]);
  const byExam = await Cutoff.aggregate([
    { $group: { _id: "$examRankType", count: { $sum: 1 } } },
    { $sort: { _id: 1 } }
  ]);

  console.log(`Total Cutoffs in MongoDB Atlas: ${totalInDB}`);
  console.log("Breakdown by Year:", byYear);
  console.log("Breakdown by Institute Type:", byInstType);
  console.log("Breakdown by Exam Rank Type:", byExam);
  console.log("==================================================");

  process.exit(0);
}

main().catch(err => {
  console.error("Cutoff Import Pipeline failed:", err);
  process.exit(1);
});
