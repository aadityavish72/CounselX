require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const path = require("path");

const connectDB = require("./db");
const Cutoff = require("./models/Cutoff");
const {
  predictCutoffTrajectory,
  backtestModel,
  generateCounsellingRecommendations
} = require("./services/counsellingEngine");
const {
  getAdvancedRecommendations
} = require("./services/advancedRecommendationService");

const app = express();
const PORT = process.env.PORT || 5000;

// Allow CORS for local development
app.use(
  cors({
    origin: true,
    credentials: true
  })
);

app.use(express.json({ limit: "100kb" }));

// Serve frontend static assets and shared JavaScript
app.use("/js", express.static(path.join(__dirname, "../js")));
app.use("/frontened", express.static(path.join(__dirname, "../frontened")));
app.get("/app", (req, res) => {
  res.redirect("/frontened/index.html");
});

// Helper: Infer institute group from institute name
function inferInstituteType(name) {
  if (!name) return "IIT";
  const s = String(name).toLowerCase();
  if (s.includes("indian institute of technology") && !s.includes("engineering science")) {
    return "IIT";
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
  if (s.includes("information technology") || s.includes("iiit")) {
    return "IIIT";
  }
  return "GFTI";
}

// Helper: Infer rank type from seat category if missing in raw document
function inferRankType(seatType, rankType) {
  if (rankType && String(rankType).trim()) {
    return String(rankType).trim();
  }
  const s = String(seatType || "").toUpperCase();
  if (s.includes("PWD")) {
    return "PwD Rank within Respective Category";
  }
  if (s === "OPEN") {
    return "CRL";
  }
  return "Category Rank";
}

// Helper: Normalize cutoff document across both collection schemas
function inferExamRankType(instituteType, instituteName) {
  const type = instituteType || inferInstituteType(instituteName);
  if (type === "IIT") return "JEE_ADVANCED";
  return "JEE_MAIN";
}

function normalizeCutoffDoc(doc) {
  if (!doc) return doc;
  const instituteName = doc.instituteName || doc.institute || "";
  const programName = doc.programName || doc.academicProgram || "";
  const instituteType = doc.instituteType || inferInstituteType(instituteName);
  const seatType = doc.seatType || doc.seatCategory || "";
  const gender = doc.gender || doc.genderPool || "";
  const rankType = inferRankType(seatType, doc.rankType);
  const examRankType = doc.examRankType || inferExamRankType(instituteType, instituteName);
  const examName = examRankType === "JEE_ADVANCED" ? "JEE Advanced" : "JEE Main";

  return {
    ...doc,
    instituteName,
    institute: instituteName,
    programName,
    academicProgram: programName,
    instituteType,
    seatType,
    seatCategory: seatType,
    gender,
    genderPool: gender,
    rankType,
    examRankType,
    examName
  };
}

// Helper: Validate institute type vs examination rank type and rank value
function validateInstituteAndRank(instituteType, examType, rank) {
  // If rank is provided, validate that it is a positive integer
  if (rank !== undefined && rank !== null && rank !== "") {
    const rawStr = String(rank).trim();
    const num = Number(rawStr);
    if (!Number.isFinite(num)) {
      const err = new Error("rank must be a valid number.");
      err.statusCode = 400;
      return { valid: false, status: 400, message: err.message, error: err };
    }
    if (num <= 0 || !Number.isInteger(num)) {
      const err = new Error("Rank must be a positive integer.");
      err.statusCode = 400;
      return { valid: false, status: 400, message: err.message, error: err };
    }
  }

  const inst = String(instituteType || "").trim().toUpperCase();
  let exam = String(examType || "").trim().toUpperCase();
  if (exam === "JEE MAIN" || exam === "JEEMAIN") exam = "JEE_MAIN";
  if (exam === "JEE ADVANCED" || exam === "JEEADVANCED") exam = "JEE_ADVANCED";

  // Rule 1: IIT cutoff searches must use JEE Advanced rank
  if (inst === "IIT") {
    if (exam === "JEE_MAIN") {
      const err = new Error("IIT cutoff searches require a JEE Advanced rank. Please enter your JEE Advanced rank.");
      err.statusCode = 400;
      return { valid: false, status: 400, message: err.message, error: err };
    }
    if (exam && exam !== "JEE_ADVANCED" && exam !== "CRL" && exam !== "CATEGORY RANK") {
      const err = new Error("IIT cutoff searches require a JEE Advanced rank. Please enter your JEE Advanced rank.");
      err.statusCode = 400;
      return { valid: false, status: 400, message: err.message, error: err };
    }
  }

  // Rule 2: NIT, IIIT, and GFTI cutoff searches must use JEE Main rank
  if (["NIT", "IIIT", "GFTI"].includes(inst)) {
    if (exam === "JEE_ADVANCED") {
      const err = new Error(`${inst} cutoff searches require a JEE Main rank. Please enter your JEE Main rank.`);
      err.statusCode = 400;
      return { valid: false, status: 400, message: err.message, error: err };
    }
    if (exam && exam !== "JEE_MAIN" && exam !== "CRL" && exam !== "CATEGORY RANK") {
      const err = new Error(`${inst} cutoff searches require a JEE Main rank. Please enter your JEE Main rank.`);
      err.statusCode = 400;
      return { valid: false, status: 400, message: err.message, error: err };
    }
  }

  return { valid: true };
}

// Helper: convert a query parameter to a number safely.
function parseOptionalNumber(value, fieldName) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    throw new Error(`${fieldName} must be a valid number.`);
  }

  return number;
}

// Helper: escape special regex characters in search text.
function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Helper: Build query filter matching both schemas in MongoDB Atlas collection
function buildCutoffFilters(query = {}) {
  const {
    year,
    round,
    instituteType,
    instituteName,
    branch,
    quota,
    seatCategory,
    seatType,
    genderPool,
    gender,
    rankType,
    examRankType,
    rank,
    search
  } = query;

  const examParam = examRankType || (
    rankType === "JEE_ADVANCED" || rankType === "JEE_MAIN" ? rankType : undefined
  );

  // Independent backend validation of instituteType vs examRankType & rank
  const validation = validateInstituteAndRank(instituteType, examParam, rank);
  if (!validation.valid) {
    throw validation.error;
  }

  const queryConditions = [];

  const parsedYear = parseOptionalNumber(year, "year");
  const parsedRound = parseOptionalNumber(round, "round");
  const parsedRank = parseOptionalNumber(rank, "rank");

  if (parsedYear !== undefined) {
    queryConditions.push({ year: parsedYear });
  }

  if (parsedRound !== undefined) {
    queryConditions.push({ round: parsedRound });
  }

  if (instituteType && instituteType.trim()) {
    const type = instituteType.trim().toUpperCase();
    if (type === "IIT") {
      queryConditions.push({
        $or: [
          { instituteType: "IIT" },
          { institute: { $regex: "Indian Institute of Technology", $options: "i" } }
        ]
      });
      queryConditions.push({ examRankType: "JEE_ADVANCED" });
    } else if (type === "NIT") {
      queryConditions.push({
        $or: [
          { instituteType: "NIT" },
          {
            institute: {
              $regex: "National Institute|Shibpur|Malaviya|Motilal|Maulana|Sardar|Visvesvaraya",
              $options: "i"
            }
          }
        ]
      });
      queryConditions.push({ examRankType: "JEE_MAIN" });
    } else if (["IIIT", "GFTI"].includes(type)) {
      queryConditions.push({ instituteType: type });
      queryConditions.push({ examRankType: "JEE_MAIN" });
    } else {
      queryConditions.push({ instituteType: type });
    }
  } else if (examParam) {
    queryConditions.push({ examRankType: examParam });
  }

  if (instituteName && instituteName.trim()) {
    const safeInst = escapeRegex(instituteName.trim());
    queryConditions.push({
      $or: [
        { instituteName: { $regex: safeInst, $options: "i" } },
        { institute: { $regex: safeInst, $options: "i" } }
      ]
    });
  }

  const branchVal = branch || query.programName || query.academicProgram;
  if (branchVal && branchVal.trim()) {
    const safeBranch = escapeRegex(branchVal.trim());
    queryConditions.push({
      $or: [
        { academicProgram: { $regex: safeBranch, $options: "i" } },
        { programName: { $regex: safeBranch, $options: "i" } }
      ]
    });
  }

  if (quota && quota.trim()) {
    queryConditions.push({ quota: quota.trim() });
  }

  const cat = seatCategory || seatType;
  if (cat && cat.trim()) {
    queryConditions.push({
      $or: [
        { seatType: cat.trim() },
        { seatCategory: cat.trim() }
      ]
    });
  }

  const gen = genderPool || gender;
  if (gen && gen.trim()) {
    queryConditions.push({
      $or: [
        { gender: gen.trim() },
        { genderPool: gen.trim() }
      ]
    });
  }

  if (rankType && rankType.trim() && rankType !== "JEE_ADVANCED" && rankType !== "JEE_MAIN") {
    queryConditions.push({ rankType: rankType.trim() });
  }

  if (parsedRank !== undefined) {
    queryConditions.push({ closingRank: { $gte: parsedRank } });
  }

  if (search && search.trim()) {
    const safeSearch = escapeRegex(search.trim());
    queryConditions.push({
      $or: [
        { instituteName: { $regex: safeSearch, $options: "i" } },
        { institute: { $regex: safeSearch, $options: "i" } },
        { academicProgram: { $regex: safeSearch, $options: "i" } },
        { programName: { $regex: safeSearch, $options: "i" } }
      ]
    });
  }

  return queryConditions.length > 0 ? { $and: queryConditions } : {};
}

// Route 1: Check server
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "CounselX backend is running.",
    stage: 1
  });
});

// Route 2: Check database connection
app.get("/api/db-status", async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        success: false,
        message: "MongoDB is not connected."
      });
    }

    const totalDocuments = await Cutoff.countDocuments();

    res.json({
      success: true,
      database: mongoose.connection.name,
      collection: "josaa_cutoff_2026",
      totalDocuments
    });
  } catch (error) {
    console.error("Database status error:", error.message);

    res.status(500).json({
      success: false,
      message: "Could not verify database status."
    });
  }
});

// Route 3: Fetch sample cutoff documents
app.get("/api/test-cutoffs", async (req, res) => {
  try {
    const rawSample = await Cutoff.find().limit(10).lean();

    if (!rawSample || rawSample.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No cutoff documents found."
      });
    }

    const sample = rawSample.map(normalizeCutoffDoc);

    res.json({
      success: true,
      message: "Cutoff data fetched successfully.",
      data: sample
    });
  } catch (error) {
    console.error("Cutoff test error:", error.message);

    res.status(500).json({
      success: false,
      message: "Could not fetch cutoff data."
    });
  }
});

// API 1: Search and filter cutoff records
app.get("/api/cutoffs", async (req, res) => {
  try {
    const { page = "1", limit = "20", sort } = req.query;

    const filters = buildCutoffFilters(req.query);

    // Pagination validation
    const pageNumber = Math.max(1, parseInt(page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNumber - 1) * pageSize;

    // Dynamic sort mapping with deterministic _id tie-breaker
    let sortObj = { year: -1, round: 1, closingRank: 1, _id: 1 };
    if (sort === "closing-asc") {
      sortObj = { closingRank: 1, _id: 1 };
    } else if (sort === "closing-desc") {
      sortObj = { closingRank: -1, _id: 1 };
    } else if (sort === "opening-asc") {
      sortObj = { openingRank: 1, _id: 1 };
    } else if (sort === "opening-desc") {
      sortObj = { openingRank: -1, _id: 1 };
    } else if (sort === "institute-asc") {
      sortObj = { instituteName: 1, institute: 1, _id: 1 };
    } else if (sort === "institute-desc") {
      sortObj = { instituteName: -1, institute: -1, _id: 1 };
    } else if (sort === "round-asc") {
      sortObj = { round: 1, closingRank: 1, _id: 1 };
    } else if (sort === "round-desc") {
      sortObj = { round: -1, closingRank: 1, _id: 1 };
    }

    const [rawRecords, totalRecords] = await Promise.all([
      Cutoff.find(filters)
        .sort(sortObj)
        .skip(skip)
        .limit(pageSize)
        .lean(),

      Cutoff.countDocuments(filters)
    ]);

    const data = rawRecords.map(normalizeCutoffDoc);

    return res.json({
      success: true,
      page: pageNumber,
      limit: pageSize,
      total: totalRecords,
      totalRecords,
      totalPages: Math.ceil(totalRecords / pageSize),
      filtersApplied: {
        ...req.query,
        page: pageNumber,
        limit: pageSize,
        sort: sort || "default"
      },
      data
    });
  } catch (error) {
    console.error("Cutoff search error:", error.message);

    return res.status(400).json({
      success: false,
      message: error.message || "Could not search cutoff data."
    });
  }
});

// API 2: Get dynamic filter options (supports contextual filters)
app.get("/api/cutoffs/filters", async (req, res) => {
  try {
    const queryFilter = buildCutoffFilters(req.query);

    const [
      years,
      rounds,
      rawInstTypes,
      quotas,
      seatTypes,
      seatCats,
      genders,
      genderPools,
      rankTypes,
      inst1,
      inst2,
      prog1,
      prog2
    ] = await Promise.all([
      Cutoff.distinct("year", queryFilter),
      Cutoff.distinct("round", queryFilter),
      Cutoff.distinct("instituteType", queryFilter),
      Cutoff.distinct("quota", queryFilter),
      Cutoff.distinct("seatType", queryFilter),
      Cutoff.distinct("seatCategory", queryFilter),
      Cutoff.distinct("gender", queryFilter),
      Cutoff.distinct("genderPool", queryFilter),
      Cutoff.distinct("rankType", queryFilter),
      Cutoff.distinct("instituteName", queryFilter),
      Cutoff.distinct("institute", queryFilter),
      Cutoff.distinct("programName", queryFilter),
      Cutoff.distinct("academicProgram", queryFilter)
    ]);

    const allInstitutes = Array.from(new Set([...inst1, ...inst2]))
      .filter(Boolean)
      .sort();

    const allPrograms = Array.from(new Set([...prog1, ...prog2]))
      .filter(Boolean)
      .sort();

    const allSeatCategories = Array.from(new Set([...seatTypes, ...seatCats]))
      .filter(Boolean)
      .sort();

    const allGenderPools = Array.from(new Set([...genders, ...genderPools]))
      .filter(Boolean)
      .sort();

    let allInstituteTypes = Array.from(new Set([...rawInstTypes, "IIT", "NIT"]))
      .filter(Boolean)
      .sort();

    if (req.query.instituteType) {
      const it = req.query.instituteType.toUpperCase();
      if (allInstituteTypes.includes(it)) {
        allInstituteTypes = [it];
      }
    }

    return res.json({
      success: true,
      filters: {
        years: years.filter(Boolean).sort((a, b) => b - a),
        rounds: rounds.filter(Boolean).sort((a, b) => a - b),
        instituteTypes: allInstituteTypes,
        quotas: quotas.filter(Boolean).sort(),
        seatCategories: allSeatCategories,
        genderPools: allGenderPools,
        rankTypes: rankTypes.filter(Boolean).sort(),
        institutes: allInstitutes,
        branches: allPrograms
      }
    });
  } catch (error) {
    console.error("Cutoff filter options error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Could not load filter options."
    });
  }
});

// API 3: Get one cutoff document by its MongoDB ID
app.get("/api/cutoffs/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid MongoDB document ID."
      });
    }

    const cutoff = await Cutoff.findById(id).lean();

    if (!cutoff) {
      return res.status(404).json({
        success: false,
        message: "Cutoff record not found."
      });
    }

    return res.json({
      success: true,
      data: normalizeCutoffDoc(cutoff)
    });
  } catch (error) {
    console.error("Single cutoff lookup error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Could not retrieve the cutoff record."
    });
  }
});

// API 4: Dashboard summary
app.get("/api/dashboard/summary", async (req, res) => {
  try {
    const [
      totalRecords,
      inst1,
      inst2,
      prog1,
      prog2,
      years,
      recentRaw
    ] = await Promise.all([
      Cutoff.countDocuments(),
      Cutoff.distinct("instituteName"),
      Cutoff.distinct("institute"),
      Cutoff.distinct("programName"),
      Cutoff.distinct("academicProgram"),
      Cutoff.distinct("year"),
      Cutoff.find({})
        .sort({ year: -1, round: -1, closingRank: 1 })
        .limit(5)
        .lean()
    ]);

    const totalInstitutes = new Set([...inst1, ...inst2].filter(Boolean)).size;
    const totalProgrammes = new Set([...prog1, ...prog2].filter(Boolean)).size;
    const recentCutoffs = recentRaw.map(normalizeCutoffDoc);

    res.json({
      success: true,
      stats: {
        totalRecords,
        totalInstitutes,
        totalProgrammes,
        totalYears: years.filter(Boolean).length
      },
      recentCutoffs
    });
  } catch (error) {
    console.error("Dashboard summary error:", error);

    res.status(500).json({
      success: false,
      message: "Dashboard data load nahi ho saka."
    });
  }
});

// API 5: Explainable Cutoff Prediction for specific trajectory
app.get("/api/predict/cutoff", async (req, res) => {
  try {
    const {
      instituteName,
      branch,
      seatCategory,
      quota,
      genderPool,
      rankType,
      targetRound = "5"
    } = req.query;

    if (!instituteName) {
      return res.status(400).json({
        success: false,
        message: "instituteName parameter is required for prediction."
      });
    }

    const inferredType = inferInstituteType(instituteName);
    const inferredExam = inferredType === "IIT" ? "JEE_ADVANCED" : "JEE_MAIN";

    const filters = buildCutoffFilters({
      instituteType: req.query.instituteType || inferredType,
      examRankType: req.query.examRankType || inferredExam,
      instituteName,
      branch,
      seatCategory,
      quota,
      genderPool,
      rankType
    });

    const records = await Cutoff.find(filters).sort({ round: 1 }).lean();
    const normalized = records.map(normalizeCutoffDoc);

    const prediction = predictCutoffTrajectory(
      normalized,
      parseInt(targetRound, 10) || 5
    );

    res.json({
      success: true,
      query: {
        instituteName,
        branch,
        seatCategory,
        quota,
        genderPool,
        rankType,
        targetRound: parseInt(targetRound, 10) || 5
      },
      historicalRounds: normalized,
      prediction
    });
  } catch (error) {
    console.error("Prediction error:", error);
    res.status(500).json({
      success: false,
      message: "Could not generate cutoff prediction: " + error.message
    });
  }
});

// API 6: Explainable Student Counselling Recommendations
async function handleCounsellingRecommendations(req, res) {
  try {
    const params = req.method === "POST" ? req.body : req.query;
    const rawRank = params.rank;

    if (rawRank === undefined || rawRank === null || rawRank === "") {
      return res.status(400).json({
        success: false,
        message: "Rank is required."
      });
    }

    const rank = Number(rawRank);
    if (!Number.isFinite(rank) || rank <= 0 || !Number.isInteger(rank)) {
      return res.status(400).json({
        success: false,
        message: "Rank must be a positive integer."
      });
    }

    // Rank type / exam type validation against instituteType
    const examParam = params.examRankType || (
      params.rankType === "JEE_ADVANCED" || params.rankType === "JEE_MAIN" ? params.rankType : undefined
    );

    const validation = validateInstituteAndRank(params.instituteType, examParam, rank);
    if (!validation.valid) {
      return res.status(validation.status || 400).json({
        success: false,
        message: validation.message
      });
    }

    const studentProfile = {
      rank,
      rankType: params.rankType || "CRL",
      examRankType: examParam || (params.instituteType === "IIT" ? "JEE_ADVANCED" : "JEE_MAIN"),
      jeeAdvancedRank: params.jeeAdvancedRank ? Number(params.jeeAdvancedRank) : (examParam === "JEE_ADVANCED" || params.instituteType === "IIT" ? rank : undefined),
      jeeMainRank: params.jeeMainRank ? Number(params.jeeMainRank) : (examParam === "JEE_MAIN" || ["NIT", "IIIT", "GFTI"].includes(params.instituteType) ? rank : undefined),
      seatCategory: params.seatCategory || params.seatType || "OPEN",
      quota: params.quota || "AI",
      genderPool: params.genderPool || params.gender || "Gender-Neutral",
      instituteType: params.instituteType || "",
      branch: params.branch || ""
    };

    // Query records from MongoDB
    const records = await Cutoff.find({}).lean();
    const normalized = records.map(normalizeCutoffDoc);

    const recommendations = generateCounsellingRecommendations(
      studentProfile,
      normalized
    );

    res.json(recommendations);
  } catch (error) {
    console.error("Counselling recommendations error:", error);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Could not generate counselling recommendations."
    });
  }
}

app.get("/api/recommendations/counsel", handleCounsellingRecommendations);
app.post("/api/recommendations/counsel", handleCounsellingRecommendations);

// API: Advanced College Recommendations (4-Factor Mathematical Scoring)
async function handleAdvancedRecommendations(req, res) {
  try {
    const isGet = req.method === "GET";
    const src = isGet ? req.query : req.body;

    const ranks = {
      jeeMain: src.jeeMainRank || (src.ranks ? src.ranks.jeeMain : undefined) || (src.rankType === "JEE_MAIN" ? src.studentRank || src.rank : undefined),
      jeeAdvanced: src.jeeAdvancedRank || (src.ranks ? src.ranks.jeeAdvanced : undefined) || (src.rankType === "JEE_ADVANCED" ? src.studentRank || src.rank : undefined)
    };

    if (src.examType === "JEE_ADVANCED" || src.instituteType === "IIT") {
      ranks.jeeAdvanced = ranks.jeeAdvanced || src.rank || src.studentRank;
    } else if (src.examType === "JEE_MAIN" || ["NIT", "IIIT", "GFTI"].includes(src.instituteType)) {
      ranks.jeeMain = ranks.jeeMain || src.rank || src.studentRank;
    } else if (!ranks.jeeMain && !ranks.jeeAdvanced && (src.rank || src.studentRank)) {
      ranks.jeeMain = src.rank || src.studentRank;
    }

    let branches = src.preferredBranches || src.branches;
    if (typeof branches === "string") {
      branches = branches.split(",").map(b => b.trim());
    }

    let institutes = src.preferredInstitutes || src.institutes;
    if (typeof institutes === "string") {
      institutes = institutes.split(",").map(i => i.trim());
    }

    let instituteTypes = src.instituteTypes || (src.instituteType ? [src.instituteType] : ["IIT", "NIT", "IIIT", "GFTI"]);
    if (typeof instituteTypes === "string") {
      instituteTypes = instituteTypes.split(",").map(t => t.trim().toUpperCase());
    }

    const profile = {
      jeeMainRank: ranks.jeeMain,
      jeeAdvancedRank: ranks.jeeAdvanced,
      category: src.category || src.seatCategory || "OPEN",
      gender: src.gender || src.genderPool || "Gender-Neutral",
      homeState: src.homeState || "Any",
      preferredBranches: branches || [],
      preferredInstitutes: institutes || [],
      instituteTypes,
      maxResultsPerTier: parseInt(src.maxResultsPerTier || src.limit, 10) || 35
    };

    const results = await getAdvancedRecommendations(profile);
    res.json({
      success: true,
      data: results
    });
  } catch (err) {
    console.error("Advanced recommendations error:", err.message);
    res.status(400).json({
      success: false,
      message: err.message || "Failed to generate advanced recommendations."
    });
  }
}

app.get("/api/recommendations/advanced", handleAdvancedRecommendations);
app.post("/api/recommendations/advanced", handleAdvancedRecommendations);
app.get("/api/recommendations", handleAdvancedRecommendations);
app.post("/api/recommendations", handleAdvancedRecommendations);

// Non-prefix fallbacks for proxy / custom dev server setups
app.get("/recommendations/advanced", handleAdvancedRecommendations);
app.post("/recommendations/advanced", handleAdvancedRecommendations);
app.get("/recommendations", handleAdvancedRecommendations);
app.post("/recommendations", handleAdvancedRecommendations);
app.get("/recommendations/counsel", handleCounsellingRecommendations);
app.post("/recommendations/counsel", handleCounsellingRecommendations);

// API 7: Historical Backtesting Engine
app.get("/api/predict/backtest", async (req, res) => {
  try {
    const trainingRound = parseInt(req.query.trainingRound, 10) || 2;

    const rawTrajectories = await Cutoff.aggregate([
      {
        $project: {
          inst: { $ifNull: ["$instituteName", "$institute"] },
          prog: { $ifNull: ["$programName", "$academicProgram"] },
          quota: 1,
          seat: { $ifNull: ["$seatType", "$seatCategory"] },
          gender: { $ifNull: ["$gender", "$genderPool"] },
          rankType: 1,
          round: 1,
          closingRank: 1,
          openingRank: 1
        }
      },
      {
        $group: {
          _id: {
            inst: "$inst",
            prog: "$prog",
            quota: "$quota",
            seat: "$seat",
            gender: "$gender",
            rankType: "$rankType"
          },
          rounds: {
            $push: {
              round: "$round",
              closingRank: "$closingRank",
              openingRank: "$openingRank"
            }
          },
          count: { $sum: 1 }
        }
      },
      { $match: { count: { $gte: 3 } } }
    ]);

    const backtest = backtestModel(rawTrajectories, trainingRound);

    res.json({
      success: true,
      trainingRound,
      backtest
    });
  } catch (error) {
    console.error("Backtest error:", error);
    res.status(500).json({
      success: false,
      message: "Could not execute historical backtesting: " + error.message
    });
  }
});

// Unknown routes handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "API route not found."
  });
});

// Start backend after database connection
async function startServer() {
  try {
    await connectDB();

    app.listen(PORT, () => {
      console.log(`CounselX backend running on port ${PORT}`);
      console.log(`Web App: http://localhost:${PORT}/app or http://localhost:${PORT}/frontened/`);
      console.log(`Health: http://localhost:${PORT}/`);
      console.log(`DB status: http://localhost:${PORT}/api/db-status`);
      console.log(`Cutoff search: http://localhost:${PORT}/api/cutoffs`);
      console.log(`Filter options: http://localhost:${PORT}/api/cutoffs/filters`);
      console.log(`Dashboard summary: http://localhost:${PORT}/api/dashboard/summary`);
    });
  } catch (error) {
    console.error("Backend startup failed:", error.message);
    process.exit(1);
  }
}

// Allow importing app for testing or direct execution
if (require.main === module) {
  startServer();
}

module.exports = app;
