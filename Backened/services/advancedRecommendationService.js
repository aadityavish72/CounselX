"use strict";

const Cutoff = require("../models/Cutoff");
const config = require("../config/recommendationConfig");

/**
 * Calculate historical match score: % of past rounds/years where studentRank <= closingRank
 */
function calculateHistoricalMatch(history, studentRank) {
  if (!history || history.length === 0) {
    return { score: 0, matches: 0, total: 0 };
  }
  let matches = 0;
  for (const item of history) {
    if (studentRank <= item.closingRank) {
      matches++;
    }
  }
  const score = Math.round((matches / history.length) * 100 * 10) / 10;
  return { score, matches, total: history.length };
}

/**
 * Calculate trend slope and trend score across chronological cutoff points
 */
function calculateCutoffTrend(history) {
  if (!history || history.length < 2) {
    return {
      score: 50,
      direction: "Stable",
      changePct: 0,
      description: "Insufficient rounds to calculate trend slope"
    };
  }

  // Sort chronological: year asc, round asc
  const sorted = [...history].sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    return a.round - b.round;
  });

  const firstClosing = sorted[0].closingRank;
  const lastClosing = sorted[sorted.length - 1].closingRank;

  if (firstClosing <= 0) {
    return { score: 50, direction: "Stable", changePct: 0, description: "Cutoff unchanged" };
  }

  // Relative change: positive means closing rank increased (easier/relaxing for candidate)
  const changePct = Math.round(((lastClosing - firstClosing) / firstClosing) * 100 * 10) / 10;

  let score = 50 + (changePct * 1.5);
  score = Math.max(0, Math.min(100, Math.round(score * 10) / 10));

  let direction = "Stable";
  let description = "Cutoff has remained relatively stable across counselling rounds.";

  if (changePct >= 5) {
    direction = "Relaxing";
    description = `Cutoff closing rank relaxed by ${changePct}% across rounds (easier admission chance).`;
  } else if (changePct <= -5) {
    direction = "Tightening";
    description = `Cutoff closing rank tightened by ${Math.abs(changePct)}% across rounds (higher competition).`;
  }

  return { score, direction, changePct, description };
}

/**
 * Calculate consistency using Coefficient of Variation (CV)
 */
function calculateConsistency(history) {
  if (!history || history.length < 2) {
    return {
      score: 50,
      cv: 0,
      consistencyPct: 100,
      isConsistent: true
    };
  }

  const values = history.map(h => h.closingRank);
  const n = values.length;
  const mean = values.reduce((sum, v) => sum + v, 0) / n;

  if (mean <= 0) {
    return { score: 50, cv: 0, consistencyPct: 100, isConsistent: true };
  }

  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / n;
  const stdDev = Math.sqrt(variance);
  const cv = Math.round((stdDev / mean) * 100 * 10) / 10;

  // Consistency score: higher CV -> lower consistency score
  // S_cons = 100 / (1 + CV / 50)
  const score = Math.round((100 / (1 + (cv / 50))) * 10) / 10;
  const consistencyPct = Math.max(0, Math.round((100 - cv) * 10) / 10);
  const isConsistent = cv < 15;

  return {
    score,
    cv,
    consistencyPct,
    isConsistent
  };
}

/**
 * Calculate Safety Margin against the latest available closing cutoff
 */
function calculateSafetyMargin(latestClosing, studentRank) {
  if (!latestClosing || latestClosing <= 0) {
    return { score: 0, margin: 0, marginPct: 0 };
  }

  const margin = latestClosing - studentRank;
  const marginPct = Math.round((margin / latestClosing) * 100 * 10) / 10;

  // Score: at margin = 0 (student rank = closing cutoff), score = 50
  // Each +1% margin adds 2 points (up to 100 at +25% margin)
  // Each -1% margin subtracts 2 points (down to 0 at -25% margin)
  let score = 50 + (marginPct * 2);
  score = Math.max(0, Math.min(100, Math.round(score * 10) / 10));

  return { score, margin, marginPct };
}

/**
 * Calculate Composite 4-Factor Weighted Score
 */
function calculateCompositeScore(sHist, sTrend, sCons, sMargin) {
  const w = config.weights;
  const composite = (w.historicalMatch * sHist) +
                    (w.cutoffTrend * sTrend) +
                    (w.consistency * sCons) +
                    (w.safetyMargin * sMargin);
  return Math.round(composite * 10) / 10;
}

/**
 * Classify recommendation into SAFE, MODERATE, AMBITIOUS, or INSUFFICIENT_DATA
 */
function classifyRecommendation(compositeScore, marginPct, historyCount) {
  if (historyCount < config.minHistoricalDataPoints) {
    return "INSUFFICIENT_DATA";
  }

  const t = config.thresholds;
  if (compositeScore >= t.safe.minScore && marginPct >= t.safe.minMarginPct) {
    return "SAFE";
  }
  if (compositeScore >= t.moderate.minScore && marginPct >= t.moderate.minMarginPct) {
    return "MODERATE";
  }
  return "AMBITIOUS";
}

/**
 * Generate human-readable explainable reasons for every recommendation
 */
function generateExplanations(tier, studentRank, latestClosing, marginPct, matchInfo, trendInfo, consistencyInfo) {
  const bullets = [];

  // 1. Rank & Margin comparison
  if (marginPct >= 0) {
    bullets.push(`Your rank (${studentRank.toLocaleString("en-IN")}) is within the latest closing cutoff (${latestClosing.toLocaleString("en-IN")}) with a +${marginPct}% safety buffer.`);
  } else {
    bullets.push(`Your rank (${studentRank.toLocaleString("en-IN")}) is ${Math.abs(marginPct)}% above the latest closing cutoff (${latestClosing.toLocaleString("en-IN")}).`);
  }

  // 2. Historical Match Evidence
  if (matchInfo.total > 0) {
    const pct = Math.round((matchInfo.matches / matchInfo.total) * 100);
    bullets.push(`Matched ${matchInfo.matches} of ${matchInfo.total} historical rounds (${pct}% historical admission rate for your rank).`);
  }

  // 3. Cutoff Trend & Stability
  bullets.push(`${trendInfo.description} Cutoff consistency is ${consistencyInfo.consistencyPct}% (CV: ${consistencyInfo.cv}%).`);

  // 4. Actionable Strategy Advice
  if (tier === "SAFE") {
    bullets.push("Strategic Choice: Strong bedrock option. Highly recommended to include in your initial preference list.");
  } else if (tier === "MODERATE") {
    bullets.push("Strategic Choice: Competitive target option. Recommended as a solid mid-tier preference for rounds 2 through 5.");
  } else if (tier === "AMBITIOUS") {
    bullets.push("Strategic Choice: Reach option. Safe to place in your top preference order without penalty under JoSAA rules.");
  } else {
    bullets.push("Strategic Choice: Limited historical data available. Verify official JoSAA archives before final choice submission.");
  }

  return bullets;
}

/**
 * Main Advanced Recommendation Generator
 */
async function getAdvancedRecommendations(profile = {}) {
  const {
    jeeMainRank,
    jeeAdvancedRank,
    category = "OPEN",
    gender = "Gender-Neutral",
    homeState = "Any",
    preferredBranches = [],
    preferredInstitutes = [],
    instituteTypes = ["IIT", "NIT", "IIIT", "GFTI"],
    maxResultsPerTier = 25
  } = profile;

  const mainRank = parseInt(jeeMainRank, 10);
  const advRank = parseInt(jeeAdvancedRank, 10);

  const hasMain = Number.isFinite(mainRank) && mainRank > 0;
  const hasAdv = Number.isFinite(advRank) && advRank > 0;

  if (!hasMain && !hasAdv) {
    throw new Error("At least one valid positive integer rank (JEE Main or JEE Advanced) must be provided.");
  }

  // Standardize category and gender
  const normCategory = String(category).trim().toUpperCase();
  const normGender = String(gender).toLowerCase().includes("female")
    ? "Female-only (including Supernumerary Seats)"
    : "Gender-Neutral";

  // Build MongoDB match criteria
  const queryConditions = [];

  // If IIT selected and Adv rank provided -> query IITs with Adv rank
  if (hasAdv && instituteTypes.includes("IIT")) {
    const iitQuery = {
      instituteType: "IIT",
      examRankType: "JEE_ADVANCED"
    };
    queryConditions.push(iitQuery);
  }

  // If NIT/IIIT/GFTI selected and Main rank provided -> query with Main rank
  const mainInstTypes = instituteTypes.filter(t => t !== "IIT");
  if (hasMain && mainInstTypes.length > 0) {
    const mainQuery = {
      instituteType: { $in: mainInstTypes },
      examRankType: "JEE_MAIN"
    };
    queryConditions.push(mainQuery);
  }

  if (queryConditions.length === 0) {
    return {
      safe: [],
      moderate: [],
      ambitious: [],
      insufficientData: [],
      summary: {
        totalEvaluated: 0,
        safeCount: 0,
        moderateCount: 0,
        ambitiousCount: 0,
        insufficientCount: 0,
        notes: "No institute types matched the provided ranks (e.g. IIT requires JEE Advanced rank, NIT/IIIT/GFTI require JEE Main rank)."
      }
    };
  }

  const baseFilter = {
    $or: queryConditions,
    $and: []
  };

  // Seat Category filter (exact match or include OPEN)
  if (normCategory !== "OPEN") {
    baseFilter.$and.push({
      $or: [
        { seatCategory: normCategory },
        { seatType: normCategory }
      ]
    });
  } else {
    baseFilter.$and.push({
      $or: [
        { seatCategory: "OPEN" },
        { seatType: "OPEN" }
      ]
    });
  }

  // Gender pool filter
  baseFilter.$and.push({
    $or: [
      { genderPool: normGender },
      { gender: normGender }
    ]
  });

  // Branch filter
  if (Array.isArray(preferredBranches) && preferredBranches.length > 0 && !preferredBranches.includes("Any")) {
    const branchRegexes = preferredBranches.map(b => new RegExp(b.trim(), "i"));
    baseFilter.$and.push({
      $or: [
        { academicProgram: { $in: branchRegexes } },
        { programName: { $in: branchRegexes } }
      ]
    });
  }

  // Institute name filter
  if (Array.isArray(preferredInstitutes) && preferredInstitutes.length > 0 && !preferredInstitutes.includes("Any")) {
    const instRegexes = preferredInstitutes.map(inst => new RegExp(inst.trim(), "i"));
    baseFilter.$and.push({
      $or: [
        { instituteName: { $in: instRegexes } },
        { institute: { $in: instRegexes } }
      ]
    });
  }

  if (baseFilter.$and.length === 0) {
    delete baseFilter.$and;
  }

  // Query records from Atlas
  const records = await Cutoff.find(baseFilter).lean();

  // Group into trajectories by unique seat key
  const trajectoryMap = new Map();

  for (const r of records) {
    const instName = r.instituteName || r.institute || "Unknown";
    const prog = r.academicProgram || r.programName || "Unknown";
    const q = r.quota || "AI";
    const cat = r.seatCategory || r.seatType || "OPEN";
    const gen = r.genderPool || r.gender || "Gender-Neutral";
    const type = r.instituteType || "NIT";
    const exam = r.examRankType || (type === "IIT" ? "JEE_ADVANCED" : "JEE_MAIN");

    const key = `${type}:::${instName}:::${prog}:::${q}:::${cat}:::${gen}:::${exam}`;

    if (!trajectoryMap.has(key)) {
      trajectoryMap.set(key, {
        key,
        instituteType: type,
        instituteName: instName,
        academicProgram: prog,
        quota: q,
        seatCategory: cat,
        genderPool: gen,
        examRankType: exam,
        examName: exam === "JEE_ADVANCED" ? "JEE Advanced" : "JEE Main",
        history: []
      });
    }

    trajectoryMap.get(key).history.push({
      year: r.year || 2026,
      round: r.round || 1,
      openingRank: r.openingRank,
      closingRank: r.closingRank,
      rankType: r.rankType || "CRL"
    });
  }

  const results = {
    SAFE: [],
    MODERATE: [],
    AMBITIOUS: [],
    INSUFFICIENT_DATA: []
  };

  // Evaluate each trajectory
  for (const traj of trajectoryMap.values()) {
    const studentRank = traj.examRankType === "JEE_ADVANCED" ? advRank : mainRank;

    if (!studentRank || studentRank <= 0) continue;

    // Sort history chronologically
    traj.history.sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      return a.round - b.round;
    });

    const latestPoint = traj.history[traj.history.length - 1];
    const latestClosing = latestPoint.closingRank;
    const historyCount = traj.history.length;

    // Calculate factors
    const matchInfo = calculateHistoricalMatch(traj.history, studentRank);
    const trendInfo = calculateCutoffTrend(traj.history);
    const consistencyInfo = calculateConsistency(traj.history);
    const marginInfo = calculateSafetyMargin(latestClosing, studentRank);

    const compositeScore = calculateCompositeScore(
      matchInfo.score,
      trendInfo.score,
      consistencyInfo.score,
      marginInfo.score
    );

    const tier = classifyRecommendation(compositeScore, marginInfo.marginPct, historyCount);
    const tierMeta = config.tiers[tier] || config.tiers.MODERATE;

    const explanations = generateExplanations(
      tier,
      studentRank,
      latestClosing,
      marginInfo.marginPct,
      matchInfo,
      trendInfo,
      consistencyInfo
    );

    // Multi-year comparison points for chart/table
    const multiYearPoints = traj.history.map(h => ({
      year: h.year,
      round: h.round,
      closingRank: h.closingRank,
      studentRank,
      margin: h.closingRank - studentRank
    }));

    const cardData = {
      id: Buffer.from(traj.key).toString("base64").substring(0, 16),
      instituteName: traj.instituteName,
      academicProgram: traj.academicProgram,
      instituteType: traj.instituteType,
      examRankType: traj.examRankType,
      examName: traj.examName,
      quota: traj.quota,
      seatCategory: traj.seatCategory,
      genderPool: traj.genderPool,
      tier,
      tierLabel: tierMeta.label,
      badgeClass: tierMeta.badgeClass,
      studentRank,
      latestClosingRank: latestClosing,
      latestOpeningRank: latestPoint.openingRank,
      latestYear: latestPoint.year,
      latestRound: latestPoint.round,
      margin: marginInfo.margin,
      marginPct: marginInfo.marginPct,
      scores: {
        composite: compositeScore,
        historicalMatch: matchInfo.score,
        trend: trendInfo.score,
        consistency: consistencyInfo.score,
        safetyMargin: marginInfo.score
      },
      metrics: {
        matches: matchInfo.matches,
        totalHistoricalPoints: historyCount,
        trendDirection: trendInfo.direction,
        trendChangePct: trendInfo.changePct,
        cv: consistencyInfo.cv,
        consistencyPct: consistencyInfo.consistencyPct
      },
      explanations,
      multiYearPoints
    };

    results[tier].push(cardData);
  }

  // Sort each tier by composite score descending
  results.SAFE.sort((a, b) => b.scores.composite - a.scores.composite);
  results.MODERATE.sort((a, b) => b.scores.composite - a.scores.composite);
  results.AMBITIOUS.sort((a, b) => b.scores.composite - a.scores.composite);
  results.INSUFFICIENT_DATA.sort((a, b) => b.marginPct - a.marginPct);

  return {
    safe: results.SAFE.slice(0, maxResultsPerTier),
    moderate: results.MODERATE.slice(0, maxResultsPerTier),
    ambitious: results.AMBITIOUS.slice(0, maxResultsPerTier),
    insufficientData: results.INSUFFICIENT_DATA.slice(0, maxResultsPerTier),
    summary: {
      totalEvaluated: trajectoryMap.size,
      safeCount: results.SAFE.length,
      moderateCount: results.MODERATE.length,
      ambitiousCount: results.AMBITIOUS.length,
      insufficientCount: results.INSUFFICIENT_DATA.length,
      studentRanksUsed: {
        jeeMainRank: hasMain ? mainRank : null,
        jeeAdvancedRank: hasAdv ? advRank : null
      },
      appliedFilters: {
        category: normCategory,
        gender: normGender,
        instituteTypes
      }
    }
  };
}

module.exports = {
  calculateHistoricalMatch,
  calculateCutoffTrend,
  calculateConsistency,
  calculateSafetyMargin,
  calculateCompositeScore,
  classifyRecommendation,
  generateExplanations,
  getAdvancedRecommendations
};
