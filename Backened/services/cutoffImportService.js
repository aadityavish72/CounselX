const fs = require("fs");
const path = require("path");
const Cutoff = require("../models/Cutoff");

/**
 * Infer institute group from institute name
 */
function inferInstituteType(name) {
  if (!name) return "IIT";
  const s = String(name).toLowerCase();
  if (s.includes("indian institute of technology") && !s.includes("engineering science")) {
    return "IIT";
  }
  if (
    s.includes("information technology") ||
    s.includes("iiit") ||
    s.includes("atal bihari") ||
    s.includes("pandit dwarka prasad")
  ) {
    return "IIIT";
  }
  if (
    s.includes("national institute of technology") ||
    s.includes("malaviya") ||
    s.includes("motilal") ||
    s.includes("maulana azad") ||
    s.includes("sardar vallabhbhai") ||
    s.includes("visvesvaraya") ||
    s.includes("shibpur")
  ) {
    return "NIT";
  }
  return "GFTI";
}

/**
 * Infer exam rank type based on institute type
 */
function inferExamRankType(instituteType) {
  if (String(instituteType).toUpperCase() === "IIT") {
    return {
      examRankType: "JEE_ADVANCED",
      examName: "JEE Advanced"
    };
  }
  return {
    examRankType: "JEE_MAIN",
    examName: "JEE Main"
  };
}

/**
 * Standardize Seat Category / Type
 */
function normalizeSeatCategory(seatType) {
  if (!seatType) return "OPEN";
  const s = String(seatType).trim();
  const upper = s.toUpperCase();
  if (upper.includes("EWS")) {
    return upper.includes("PWD") ? "GEN-EWS (PwD)" : "GEN-EWS";
  }
  if (upper.includes("OBC")) {
    return upper.includes("PWD") ? "OBC-NCL (PwD)" : "OBC-NCL";
  }
  if (upper.startsWith("SC")) {
    return upper.includes("PWD") ? "SC (PwD)" : "SC";
  }
  if (upper.startsWith("ST")) {
    return upper.includes("PWD") ? "ST (PwD)" : "ST";
  }
  if (upper.includes("OPEN")) {
    return upper.includes("PWD") ? "OPEN (PwD)" : "OPEN";
  }
  return s;
}

/**
 * Standardize Gender Pool
 */
function normalizeGender(gender) {
  if (!gender) return "Gender-Neutral";
  const s = String(gender).trim();
  if (s.toLowerCase().includes("female")) {
    return "Female-only (including Supernumerary Seats)";
  }
  return "Gender-Neutral";
}

/**
 * Parse rank value and detect preparatory ranks
 */
function parseRank(val) {
  if (val === null || val === undefined) return { rank: null, isPreparatory: false };
  const str = String(val).trim();
  const isPreparatory = str.toUpperCase().endsWith("P") || str.toUpperCase().startsWith("P");
  const cleanStr = str.replace(/[^\d]/g, "");
  const num = parseInt(cleanStr, 10);
  return {
    rank: Number.isFinite(num) && num > 0 ? num : null,
    isPreparatory
  };
}

/**
 * Standardize single cutoff document
 */
function normalizeCutoffRecord(raw, fallbackYear = 2026, fallbackRound = 1) {
  const instituteName = (raw.instituteName || raw.institute || "").trim();
  if (!instituteName) return null;

  const academicProgram = (
    raw.academicProgram ||
    raw.programName ||
    raw.program ||
    ""
  ).trim();
  if (!academicProgram) return null;

  const instituteType = raw.instituteType ? raw.instituteType.toUpperCase() : inferInstituteType(instituteName);
  const examInfo = inferExamRankType(instituteType);

  const openParsed = parseRank(raw.openingRank ?? raw.openingRankRaw);
  const closeParsed = parseRank(raw.closingRank ?? raw.closingRankRaw);

  if (!openParsed.rank || !closeParsed.rank) {
    return null; // Skip invalid rank records
  }

  const quota = (raw.quota || "AI").trim().toUpperCase();
  const seatCategory = normalizeSeatCategory(raw.seatType || raw.seatCategory);
  const genderPool = normalizeGender(raw.gender || raw.genderPool);

  const round = parseInt(raw.round || fallbackRound, 10) || 1;
  const year = parseInt(raw.year || fallbackYear, 10) || fallbackYear;

  let rankType = raw.rankType;
  if (!rankType || !String(rankType).trim()) {
    if (seatCategory.includes("PwD")) {
      rankType = "PwD Rank within Respective Category";
    } else if (seatCategory === "OPEN") {
      rankType = "CRL";
    } else {
      rankType = "Category Rank";
    }
  }

  return {
    year,
    round,
    instituteType,
    instituteName,
    institute: instituteName,
    programName: academicProgram,
    academicProgram,
    degree: raw.degree || (academicProgram.includes("Dual") ? "B.Tech + M.Tech" : "Bachelor of Technology"),
    durationYears: raw.durationYears || (academicProgram.includes("5") ? 5 : 4),
    quota,
    seatType: seatCategory,
    seatCategory,
    gender: genderPool,
    genderPool,
    openingRank: openParsed.rank,
    closingRank: closeParsed.rank,
    rankType,
    examRankType: examInfo.examRankType,
    examName: examInfo.examName,
    isPreparatoryRank: openParsed.isPreparatory || closeParsed.isPreparatory || Boolean(raw.isPreparatoryRank),
    counsellingType: raw.counsellingType || "JoSAA",
    sourceUrl: raw.sourceUrl || "https://josaa.admissions.nic.in/"
  };
}

/**
 * Parse official JoSAA HTML table export
 */
function parseHTMLCutoffs(htmlContent, defaultYear = 2025, defaultRound = 1) {
  const trs = htmlContent.match(/<tr[\s\S]*?<\/tr>/gi) || [];
  const records = [];

  for (let i = 1; i < trs.length; i++) {
    const tds = (trs[i].match(/<td[\s\S]*?<\/td>/gi) || []).map(td =>
      td.replace(/<[^>]+>/g, "").trim()
    );
    if (tds.length >= 7) {
      records.push({
        institute: tds[0],
        academicProgram: tds[1],
        quota: tds[2],
        seatType: tds[3],
        gender: tds[4],
        openingRank: tds[5],
        closingRank: tds[6],
        year: defaultYear,
        round: defaultRound
      });
    }
  }
  return records;
}

/**
 * Import a single file (JSON or HTML) into MongoDB Atlas
 */
async function importCutoffFile(filePath, options = {}) {
  const stats = {
    filePath,
    fileName: path.basename(filePath),
    totalRead: 0,
    validRecords: 0,
    upsertedCount: 0,
    modifiedCount: 0,
    skippedCount: 0,
    matchedCount: 0,
    errors: []
  };

  if (!fs.existsSync(filePath)) {
    stats.errors.push(`File not found: ${filePath}`);
    return stats;
  }

  const fileName = path.basename(filePath).toLowerCase();
  let defaultYear = options.year;
  if (!defaultYear) {
    if (fileName.includes("2024")) defaultYear = 2024;
    else if (fileName.includes("2025")) defaultYear = 2025;
    else defaultYear = 2026;
  }

  let defaultRound = options.round;
  if (!defaultRound) {
    const roundMatch = fileName.match(/round(\d+)|r(\d+)/i);
    if (roundMatch) {
      defaultRound = parseInt(roundMatch[1] || roundMatch[2], 10);
    } else {
      defaultRound = 1;
    }
  }

  const rawContent = fs.readFileSync(filePath, "utf8");
  let rawItems = [];

  if (fileName.endsWith(".html") || fileName.endsWith(".htm")) {
    rawItems = parseHTMLCutoffs(rawContent, defaultYear, defaultRound);
  } else if (fileName.endsWith(".json")) {
    const parsed = JSON.parse(rawContent);
    rawItems = Array.isArray(parsed) ? parsed : (parsed.records || []);
  } else {
    stats.errors.push("Unsupported file type: must be .json or .html");
    return stats;
  }

  stats.totalRead = rawItems.length;

  const validDocs = [];
  for (const item of rawItems) {
    const normalized = normalizeCutoffRecord(item, defaultYear, defaultRound);
    if (normalized) {
      validDocs.push(normalized);
    } else {
      stats.skippedCount++;
    }
  }

  stats.validRecords = validDocs.length;
  if (validDocs.length === 0) {
    return stats;
  }

  // Batch bulkWrite upserts in chunks of 500
  const BATCH_SIZE = 500;
  for (let i = 0; i < validDocs.length; i += BATCH_SIZE) {
    const chunk = validDocs.slice(i, i + BATCH_SIZE);
    const operations = chunk.map(doc => ({
      updateOne: {
        filter: {
          year: doc.year,
          round: doc.round,
          instituteName: doc.instituteName,
          academicProgram: doc.academicProgram,
          quota: doc.quota,
          seatCategory: doc.seatCategory,
          genderPool: doc.genderPool,
          rankType: doc.rankType,
          examRankType: doc.examRankType
        },
        update: { $set: doc },
        upsert: true
      }
    }));

    try {
      const result = await Cutoff.bulkWrite(operations, { ordered: false });
      stats.upsertedCount += result.upsertedCount || 0;
      stats.modifiedCount += result.modifiedCount || 0;
      stats.matchedCount += result.matchedCount || 0;
    } catch (err) {
      stats.errors.push(`Batch upsert error: ${err.message}`);
    }
  }

  return stats;
}

/**
 * Scan directory and import all cutoff datasets
 */
async function importAllRawCutoffs(dirPath) {
  const overall = {
    totalFiles: 0,
    totalRead: 0,
    validRecords: 0,
    upsertedCount: 0,
    modifiedCount: 0,
    skippedCount: 0,
    matchedCount: 0,
    fileSummaries: [],
    errors: []
  };

  function findFiles(dir) {
    let files = [];
    const items = fs.readdirSync(dir);
    for (const item of items) {
      const full = path.join(dir, item);
      if (fs.statSync(full).isDirectory()) {
        files = files.concat(findFiles(full));
      } else if (item.endsWith(".json") || item.endsWith(".html")) {
        files.push(full);
      }
    }
    return files;
  }

  const allFiles = findFiles(dirPath);
  overall.totalFiles = allFiles.length;

  for (const file of allFiles) {
    console.log(`Processing: ${path.basename(file)}...`);
    const fileStats = await importCutoffFile(file);
    overall.totalRead += fileStats.totalRead;
    overall.validRecords += fileStats.validRecords;
    overall.upsertedCount += fileStats.upsertedCount;
    overall.modifiedCount += fileStats.modifiedCount;
    overall.skippedCount += fileStats.skippedCount;
    overall.matchedCount += fileStats.matchedCount;
    if (fileStats.errors.length) {
      overall.errors.push(...fileStats.errors);
    }
    overall.fileSummaries.push({
      file: fileStats.fileName,
      totalRead: fileStats.totalRead,
      valid: fileStats.validRecords,
      upserted: fileStats.upsertedCount,
      modified: fileStats.modifiedCount
    });
  }

  return overall;
}

module.exports = {
  inferInstituteType,
  inferExamRankType,
  normalizeSeatCategory,
  normalizeGender,
  normalizeCutoffRecord,
  parseHTMLCutoffs,
  importCutoffFile,
  importAllRawCutoffs
};
