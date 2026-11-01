
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

const connectDB = require("./db");
const Cutoff = require("./models/Cutoff");

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: [
    "http://localhost:5500",
    "http://127.0.0.1:5500",
    "http://localhost:3000",
    "http://127.0.0.1:3000"
  ]
}));

app.use(express.json({ limit: "100kb" }));

// Route 1: Check server
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "CounselX backend is running.",
    stage: 2
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

// Route 3: Fetch one cutoff document
app.get("/api/test-cutoffs", async (req, res) => {
  try {
    const sample = await Cutoff.find().lean();
    // console.log('Sample data:',sample)

    if (!sample ||sample.length===0) {
      return res.status(404).json({
        success: false,
        message: "No cutoff documents found."
      });
    }

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


/*
  STAGE 3: JO SAA CUTOFF SEARCH API
  Paste these routes before the Unknown routes handler.
*/

// Helper: convert a query parameter to a number safely.
function parseOptionalNumber(value, fieldName) {
  if (value === undefined || value === "") {
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
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}


// API 1: Search and filter cutoff records
app.get("/api/cutoffs", async (req, res) => {
  try {
    const {
      year,
      round,
      instituteType,
      instituteName,
      branch,
      quota,
      seatCategory,
      genderPool,
      rankType,
      rank,
      search,
      page = "1",
      limit = "20"
    } = req.query;

    const filters = {};
page = Math.max(1, Number(req.query.page) || 1);
limit = Math.min(
  50,
  Math.max(1, Number(req.query.limit) || 20)
);

skip = (page - 1) * limit;

// `filter` mein tumhare validated MongoDB query conditions honge.
[data, total] = await Promise.all([
  Cutoff.find(filter).skip(skip).limit(limit).lean(),
  Cutoff.countDocuments(filter)
]);

res.json({ data, total, page, limit });

    // Numeric filters
    const parsedYear = parseOptionalNumber(year, "year");
    const parsedRound = parseOptionalNumber(round, "round");
    const parsedRank = parseOptionalNumber(rank, "rank");

    if (parsedYear !== undefined) {
      filters.year = parsedYear;
    }

    if (parsedRound !== undefined) {
      filters.round = parsedRound;
    }

    // Exact text filters
    if (instituteType) {
      filters.instituteType = instituteType;
    }

    if (instituteName) {
      filters.instituteName = {
        $regex: escapeRegex(instituteName),
        $options: "i"
      };
    }

    if (branch) {
      filters.academicProgram = {
        $regex: escapeRegex(branch),
        $options: "i"
      };
    }

    if (quota) {
      filters.quota = quota;
    }

    if (seatCategory) {
      filters.seatCategory = seatCategory;
    }

    if (genderPool) {
      filters.genderPool = genderPool;
    }

    if (rankType) {
      filters.rankType = rankType;
    }

    // A historical closing rank greater than or equal to
    // the student's rank is a preliminary comparison only.
    if (parsedRank !== undefined) {
      if (parsedRank < 1) {
        return res.status(400).json({
          success: false,
          message: "rank must be a positive number."
        });
      }

      filters.closingRank = { $gte: parsedRank };
    }

    // Search across institute and program names.
    if (search && search.trim()) {
      const safeSearch = escapeRegex(search.trim());

      filters.$or = [
        {
          instituteName: {
            $regex: safeSearch,
            $options: "i"
          }
        },
        {
          academicProgram: {
            $regex: safeSearch,
            $options: "i"
          }
        }
      ];
    }
    console.log(req.query);
    // Pagination validation
    const pageNumber = Number(req.query.page);
    const pageSize = Number(req.query.limit);

    if (
      !Number.isInteger(pageNumber) ||
      pageNumber < 1 ||
      !Number.isInteger(pageSize) ||
      pageSize < 1 ||
      pageSize > 100
    ) {
      return res.status(400).json({
        success: false,
        message: "page must be >= 1 and limit must be between 1 and 100."
      });
    }

    const skip = (pageNumber - 1) * pageSize;

    const [data, totalRecords] = await Promise.all([
      Cutoff.find(filters)
        .sort({ year: -1, round: 1, closingRank: 1 })
        .skip(skip)
        .limit(pageSize)
        .lean(),

      Cutoff.countDocuments(filters)
    ]);

    return res.json({
      success: true,
      page: pageNumber,
      limit: pageSize,
      totalRecords,
      totalPages: Math.ceil(totalRecords / pageSize),
      filtersApplied: {
        year: parsedYear,
        round: parsedRound,
        instituteType,
        instituteName,
        branch,
        quota,
        seatCategory,
        genderPool,
        rankType,
        rank: parsedRank,
        search
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


// API 2: Get available filter values
app.get("/api/cutoffs/filters", async (req, res) => {
  try {
    const [
      years,
      rounds,
      instituteTypes,
      quotas,
      seatCategories,
      genderPools,
      rankTypes
    ] = await Promise.all([
      Cutoff.distinct("year"),
      Cutoff.distinct("round"),
      Cutoff.distinct("instituteType"),
      Cutoff.distinct("quota"),
      Cutoff.distinct("seatType"),
      Cutoff.distinct("gender"),
      Cutoff.distinct("rankType")
    ]);

    return res.json({
      success: true,
      filters: {
        years: years.sort((a, b) => b - a),
        rounds: rounds.sort((a, b) => a - b),
        instituteTypes: instituteTypes.filter(Boolean).sort(),
        quotas: quotas.filter(Boolean).sort(),
        seatCategories: seatCategories.filter(Boolean).sort(),
        genderPools: genderPools.filter(Boolean).sort(),
        rankTypes: rankTypes.filter(Boolean).sort()
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
      data: cutoff
    });
  } catch (error) {
    console.error("Single cutoff lookup error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Could not retrieve the cutoff record."
    });
  }
});

// Add near your other imports if not already present
// const Cutoff = require("./models/Cutoff");

// Dashboard summary API
app.get("/api/dashboard/summary", async (req, res) => {
  try {
    const [
      totalRecords,
      institutes,
      programmes,
      years,
      recentCutoffs
    ] = await Promise.all([
      Cutoff.countDocuments(),

      Cutoff.distinct("instituteName"),

      Cutoff.distinct("academicProgram"),

      Cutoff.distinct("year"),

      Cutoff.find({})
        .sort({ year: -1, round: -1 })
        .limit(5)
        .lean()
    ]);

    res.json({
      success: true,
      stats: {
        totalRecords,
        totalInstitutes: institutes.length,
        totalProgrammes: programmes.length,
        totalYears: years.length
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

// Unknown routes
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
      console.log(`Health: http://localhost:${PORT}/`);
      console.log(`DB status: http://localhost:${PORT}/api/db-status`);
      console.log(`Sample data: http://localhost:${PORT}/api/test-cutoffs`);
    });
  } catch (error) {
    console.error("Backend startup failed:", error.message);
    process.exit(1);
  }
}

startServer();
