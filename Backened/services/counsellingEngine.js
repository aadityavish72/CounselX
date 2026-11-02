"use strict";

/**
 * CounselX Counselling & Explainable Cutoff Prediction Engine
 *
 * Implements:
 * 1. Data-sufficiency verification.
 * 2. Multi-round cutoff drift estimation with decaying velocity.
 * 3. Range prediction with explicit uncertainty bounds (never single-point guarantees).
 * 4. Transparent, explainable reasoning for every recommendation tier.
 * 5. Strict profile-to-allotment validation (rankType, category, quota, genderPool).
 * 6. Empirical backtesting on historical JoSAA round movements.
 */

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

// Helper: Standard deviation of an array of numbers
function standardDeviation(values) {
  if (!values || values.length <= 1) return 0;
  const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
  const squaredDiffs = values.map((val) => Math.pow(val - mean, 2));
  const variance =
    squaredDiffs.reduce((sum, val) => sum + val, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/**
 * Predict cutoff trajectory for a specific allotment path using historical rounds.
 *
 * @param {Array<Object>} historicalRounds - Array of { round, openingRank, closingRank }
 * @param {number} targetRound - Target JoSAA round (default: 5)
 * @returns {Object} Prediction result with evidence, ranges, uncertainty, and explanation
 */
function predictCutoffTrajectory(historicalRounds, targetRound = 5) {
  if (!Array.isArray(historicalRounds) || historicalRounds.length === 0) {
    return {
      dataSufficiency: "INSUFFICIENT",
      observationsCount: 0,
      predictedRange: null,
      uncertaintyScore: 100,
      confidenceLevel: "NONE",
      explanation: "No historical round data available for this college and branch combination.",
      disclaimer: "Historical comparison only. Admission is governed by JoSAA seat allotment and is never guaranteed."
    };
  }

  // Sort rounds chronologically
  const sorted = [...historicalRounds]
    .filter((r) => Number.isFinite(Number(r.closingRank)) && Number(r.closingRank) > 0)
    .sort((a, b) => Number(a.round) - Number(b.round));

  const count = sorted.length;
  const latestRecord = sorted[count - 1];
  const firstRecord = sorted[0];

  const firstClosing = Number(firstRecord.closingRank);
  const latestClosing = Number(latestRecord.closingRank);
  const latestRound = Number(latestRecord.round);

  // If only 1 round observation exists
  if (count < 2) {
    return {
      dataSufficiency: "INSUFFICIENT",
      observationsCount: count,
      historicalRounds: sorted,
      lastObservedRound: latestRound,
      lastObservedClosingRank: latestClosing,
      predictedRange: {
        min: latestClosing,
        expected: latestClosing,
        max: Math.round(latestClosing * 1.08)
      },
      uncertaintyScore: 40.0,
      confidenceLevel: "LOW",
      driftPercentage: 0,
      explanation: `Only Round ${latestRound} data is recorded (${latestClosing.toLocaleString("en-IN")}). Without multiple rounds, statistical velocity cannot be reliably established; range is bounded conservatively.`,
      disclaimer: "Preliminary historical range only. Admission is not guaranteed."
    };
  }

  // Calculate round-to-round shifts
  const roundDeltas = [];
  const pctChanges = [];

  for (let i = 1; i < count; i++) {
    const prev = Number(sorted[i - 1].closingRank);
    const curr = Number(sorted[i].closingRank);
    const delta = curr - prev;
    roundDeltas.push(delta);
    if (prev > 0) {
      pctChanges.push(delta / prev);
    }
  }

  const totalHistoricalDrift = latestClosing - firstClosing;
  const driftPercentage = Number(((totalHistoricalDrift / firstClosing) * 100).toFixed(2));

  // Volatility across rounds
  const pctStdDev = standardDeviation(pctChanges);
  const avgShiftPct =
    pctChanges.length > 0
      ? pctChanges.reduce((a, b) => a + b, 0) / pctChanges.length
      : 0;

  // Remaining rounds until targetRound
  const roundsRemaining = Math.max(0, targetRound - latestRound);

  // If we already have the target round observation (e.g. Round 5)
  if (roundsRemaining === 0) {
    const volatilityScore = Number(Math.min(25, pctStdDev * 100).toFixed(1));
    return {
      dataSufficiency: "SUFFICIENT",
      observationsCount: count,
      historicalRounds: sorted,
      lastObservedRound: latestRound,
      lastObservedClosingRank: latestClosing,
      driftPercentage,
      predictedRange: {
        min: latestClosing,
        expected: latestClosing,
        max: Math.round(latestClosing * (1 + Math.max(0.02, pctStdDev)))
      },
      uncertaintyScore: Math.max(5.0, volatilityScore),
      confidenceLevel: volatilityScore <= 6.0 ? "HIGH" : "MEDIUM",
      explanation: `Observed final Round ${latestRound} closing rank is ${latestClosing.toLocaleString("en-IN")}, demonstrating a total historical drift of ${driftPercentage >= 0 ? "+" : ""}${driftPercentage}% from Round 1 across ${count} rounds.`,
      disclaimer: "Historical comparison only. Admission is governed by official JoSAA rules and is never guaranteed."
    };
  }

  // Decayed velocity forecasting for future rounds
  // JoSAA round movements decelerate heavily after Round 2/3
  const decayFactor = 0.65;
  let cumulativeExpansionFactor = 0;
  for (let step = 1; step <= roundsRemaining; step++) {
    cumulativeExpansionFactor += avgShiftPct * Math.pow(decayFactor, step);
  }

  // Bound minimum at latest observed closing rank (cutoffs almost never shrink in JoSAA)
  const predictedMin = latestClosing;
  const predictedExpected = Math.round(
    latestClosing * (1 + Math.max(0, cumulativeExpansionFactor))
  );

  // Upper bound accounts for standard error margin
  const marginPct = Math.max(0.04, avgShiftPct + pctStdDev * 1.5);
  const predictedMax = Math.round(
    predictedExpected * (1 + marginPct * Math.sqrt(roundsRemaining))
  );

  const uncertaintyScore = Number(
    Math.min(50, Math.max(6, (pctStdDev * 100 * roundsRemaining) + 8)).toFixed(1)
  );

  let confidenceLevel = "HIGH";
  if (uncertaintyScore > 25 || count < 3) {
    confidenceLevel = "LOW";
  } else if (uncertaintyScore > 14) {
    confidenceLevel = "MEDIUM";
  }

  return {
    dataSufficiency: "SUFFICIENT",
    observationsCount: count,
    historicalRounds: sorted,
    lastObservedRound: latestRound,
    lastObservedClosingRank: latestClosing,
    driftPercentage,
    predictedRange: {
      min: predictedMin,
      expected: predictedExpected,
      max: predictedMax
    },
    uncertaintyScore,
    confidenceLevel,
    explanation: `Based on ${count} observed rounds showing an average round-to-round drift of ${(avgShiftPct * 100).toFixed(1)}%, the final round cutoff is projected between ${predictedMin.toLocaleString("en-IN")} and ${predictedMax.toLocaleString("en-IN")} with expected closing near ${predictedExpected.toLocaleString("en-IN")}.`,
    disclaimer: "Predictions are mathematical models based on historical movements. Real allotments depend on applicant volume, seat matrix adjustments, and official JoSAA rules."
  };
}

/**
 * Backtest the prediction engine against actual historical JoSAA data.
 *
 * Takes trajectories having data up to final round, trains on earlier rounds (e.g. Rounds 1-2),
 * and checks whether the actual observed final cutoff falls within the predicted range.
 *
 * @param {Array<Object>} trajectories - Array of trajectory objects with rounds
 * @param {number} trainingCutoffRound - Max round to use for prediction (e.g. 2)
 * @returns {Object} Backtest summary metrics
 */
function backtestModel(trajectories, trainingCutoffRound = 2) {
  let totalEvaluated = 0;
  let hitsInRange = 0;
  let absoluteErrorSum = 0;
  let percentageErrorSum = 0;
  const sampleEvaluations = [];

  trajectories.forEach((traj) => {
    const allRounds = traj.rounds || [];
    if (allRounds.length < 3) return;

    // Must have a final round observation (e.g. Round 5)
    const finalRecord = allRounds.find((r) => Number(r.round) === 5) || allRounds[allRounds.length - 1];
    if (!finalRecord || Number(finalRecord.round) <= trainingCutoffRound) return;

    const actualFinalClosing = Number(finalRecord.closingRank);
    if (!Number.isFinite(actualFinalClosing) || actualFinalClosing <= 0) return;

    // Use only training rounds (<= trainingCutoffRound)
    const trainingRounds = allRounds.filter(
      (r) => Number(r.round) <= trainingCutoffRound
    );
    if (trainingRounds.length < 1) return;

    // Generate prediction
    const prediction = predictCutoffTrajectory(
      trainingRounds,
      Number(finalRecord.round)
    );
    if (!prediction.predictedRange) return;

    totalEvaluated++;

    const expected = prediction.predictedRange.expected;
    const min = prediction.predictedRange.min;
    const max = prediction.predictedRange.max;

    const inRange = actualFinalClosing >= min && actualFinalClosing <= max;
    if (inRange) hitsInRange++;

    const absError = Math.abs(actualFinalClosing - expected);
    const pctError = (absError / actualFinalClosing) * 100;

    absoluteErrorSum += absError;
    percentageErrorSum += pctError;

    if (sampleEvaluations.length < 10) {
      sampleEvaluations.push({
        institute: traj.instituteName || traj._id?.inst,
        category: traj.seatCategory || traj._id?.seat,
        quota: traj.quota || traj._id?.quota,
        trainingRoundsCount: trainingRounds.length,
        actualFinalClosing,
        predictedRange: prediction.predictedRange,
        inRange,
        percentageError: Number(pctError.toFixed(2)),
        confidence: prediction.confidenceLevel
      });
    }
  });

  const hitRate =
    totalEvaluated > 0
      ? Number(((hitsInRange / totalEvaluated) * 100).toFixed(2))
      : 0;
  const meanAbsolutePercentageError =
    totalEvaluated > 0
      ? Number((percentageErrorSum / totalEvaluated).toFixed(2))
      : 0;

  return {
    totalEvaluated,
    hitsInRange,
    hitRate,
    meanAbsolutePercentageError,
    trainingRoundsUsed: trainingCutoffRound,
    targetRoundTested: 5,
    sampleEvaluations
  };
}

/**
 * Generate explainable student counselling recommendations.
 *
 * @param {Object} studentProfile - { rank, rankType, seatCategory, quota, genderPool, instituteType, round, branch }
 * @param {Array<Object>} cutoffRecords - All historical cutoff records from database
 * @returns {Object} Categorized recommendations with historical evidence and predictions
 */
function generateCounsellingRecommendations(studentProfile, cutoffRecords) {
  if (!studentProfile || !studentProfile.rank || !Number.isFinite(Number(studentProfile.rank))) {
    return {
      success: false,
      message: "Valid student rank is required to generate counselling recommendations.",
      tiers: { safe: [], target: [], reach: [], unlikely: [] },
      summary: { totalMatched: 0 }
    };
  }

  const rawRank = Number(studentProfile.rank);
  if (!Number.isInteger(rawRank) || rawRank <= 0) {
    const err = new Error("Rank must be a positive integer.");
    err.statusCode = 400;
    throw err;
  }

  const studentRank = rawRank;
  const targetRankType = studentProfile.rankType || "CRL";
  const targetCategory = studentProfile.seatCategory || "OPEN";
  const targetQuota = studentProfile.quota || "AI";
  const targetGender = studentProfile.genderPool || "Gender-Neutral";
  const targetInstituteType = (studentProfile.instituteType || "").trim().toUpperCase();
  const targetBranch = (studentProfile.branch || "").trim().toLowerCase();

  // Determine examination rank type
  const targetExamRankType = studentProfile.examRankType || (
    targetRankType === "JEE_ADVANCED" || targetRankType === "JEE_MAIN"
      ? targetRankType
      : (targetInstituteType === "IIT" ? "JEE_ADVANCED" : (["NIT", "IIIT", "GFTI"].includes(targetInstituteType) ? "JEE_MAIN" : null))
  );

  // Validate IIT vs JEE_MAIN and NIT/IIIT/GFTI vs JEE_ADVANCED
  if (targetInstituteType === "IIT" && targetExamRankType === "JEE_MAIN") {
    const err = new Error("IIT cutoff searches require a JEE Advanced rank. Please enter your JEE Advanced rank.");
    err.statusCode = 400;
    throw err;
  }
  if (["NIT", "IIIT", "GFTI"].includes(targetInstituteType) && targetExamRankType === "JEE_ADVANCED") {
    const err = new Error(`${targetInstituteType} cutoff searches require a JEE Main rank. Please enter your JEE Main rank.`);
    err.statusCode = 400;
    throw err;
  }

  // 1. Group records by unique allotment trajectory:
  // Key: instituteName + '|' + programName + '|' + quota + '|' + seatCategory + '|' + genderPool + '|' + rankType
  const trajectories = new Map();

  cutoffRecords.forEach((record) => {
    const inst = record.instituteName || record.institute;
    const prog = record.programName || record.academicProgram;
    const quota = record.quota;
    const cat = record.seatCategory || record.seatType;
    const gen = record.genderPool || record.gender;
    const rType = inferRankType(cat, record.rankType);
    const type = record.instituteType || inferInstituteType(inst);
    const rExam = record.examRankType || (type === "IIT" ? "JEE_ADVANCED" : "JEE_MAIN");

    if (!inst || !prog) return;

    // Strict allotment eligibility checks:
    // Rank type match (CRL vs Category Rank)
    if (rType && targetRankType !== "JEE_ADVANCED" && targetRankType !== "JEE_MAIN" && rType !== targetRankType) {
      return;
    }

    // Seat category match
    if (cat && cat !== targetCategory) return;

    // Quota match (unless student selected All)
    if (targetQuota && targetQuota !== "All" && quota && quota !== targetQuota) {
      return;
    }

    // Gender pool match (female-only seats are not applicable to male candidates)
    if (targetGender === "Gender-Neutral" && gen && gen.includes("Female-only")) {
      return;
    }
    if (targetGender.includes("Female-only") && gen && !gen.includes("Female-only")) {
      // Female candidates can access both female-only and gender-neutral seats
    }

    // Institute type filter
    if (targetInstituteType && targetInstituteType !== "ALL" && type !== targetInstituteType) {
      return;
    }

    // Branch filter
    if (targetBranch && !prog.toLowerCase().includes(targetBranch)) {
      return;
    }

    // Strict Examination matching:
    // IITs must strictly use JEE Advanced rank; NITs, IIITs, GFTIs must strictly use JEE Main rank.
    let applicableStudentRank = studentRank;

    if (rExam === "JEE_ADVANCED") {
      if (studentProfile.jeeAdvancedRank) {
        applicableStudentRank = Number(studentProfile.jeeAdvancedRank);
      } else if (targetExamRankType === "JEE_ADVANCED" || targetInstituteType === "IIT") {
        applicableStudentRank = studentRank;
      } else {
        // Record is IIT (JEE Advanced), but user did not provide a JEE Advanced rank. Exclude.
        return;
      }
    } else { // JEE_MAIN
      if (studentProfile.jeeMainRank) {
        applicableStudentRank = Number(studentProfile.jeeMainRank);
      } else if (targetExamRankType === "JEE_MAIN" || ["NIT", "IIIT", "GFTI"].includes(targetInstituteType)) {
        applicableStudentRank = studentRank;
      } else if (targetExamRankType === "JEE_ADVANCED" || targetInstituteType === "IIT") {
        // Record is NIT (JEE Main), but user only specified a JEE Advanced rank. Exclude.
        return;
      } else {
        applicableStudentRank = studentRank;
      }
    }

    const key = `${inst}___${prog}___${quota}___${cat}___${gen}___${rType}___${rExam}`;

    if (!trajectories.has(key)) {
      trajectories.set(key, {
        id: record._id || record.id,
        instituteName: inst,
        programName: prog,
        instituteType: type,
        examRankType: rExam,
        examName: rExam === "JEE_ADVANCED" ? "JEE Advanced" : "JEE Main",
        applicableStudentRank,
        quota,
        seatCategory: cat,
        genderPool: gen,
        rankType: rType,
        source: record.source || "JoSAA",
        sourceUrl: record.sourceUrl || "https://josaa.admissions.nic.in/",
        rounds: []
      });
    }

    trajectories.get(key).rounds.push({
      round: Number(record.round),
      year: Number(record.year || 2026),
      openingRank: Number(record.openingRank),
      closingRank: Number(record.closingRank),
      isPreparatory: !!(record.isPreparatoryRank || record.closingRankPreparatory)
    });
  });

  // 2. Compute trajectory predictions and evaluate each recommendation
  const safe = [];
  const target = [];
  const reach = [];
  const unlikely = [];

  for (const [key, traj] of trajectories.entries()) {
    // Sort rounds
    traj.rounds.sort((a, b) => a.round - b.round);

    const applicableRank = traj.applicableStudentRank;
    const examName = traj.examName;

    // Run prediction engine
    const prediction = predictCutoffTrajectory(traj.rounds, 5);
    const latestObserved = traj.rounds[traj.rounds.length - 1];
    const historicalClosing = latestObserved.closingRank;
    const expectedClosing = prediction.predictedRange
      ? prediction.predictedRange.expected
      : historicalClosing;
    const maxPredictedClosing = prediction.predictedRange
      ? prediction.predictedRange.max
      : Math.round(historicalClosing * 1.15);

    // Margin calculations
    const historicalMargin = historicalClosing - applicableRank;
    const expectedMargin = expectedClosing - applicableRank;
    const historicalMarginPct = Number(
      ((historicalMargin / historicalClosing) * 100).toFixed(1)
    );

    const closingThresholdStatus = applicableRank <= historicalClosing
      ? "Within historical closing threshold"
      : "Outside historical closing threshold";

    // Classification criteria using conservative buffers:
    // Safe: rank <= 0.85 * expectedClosing (comfortably inside cutoff)
    // Target: 0.85 * expectedClosing < rank <= expectedClosing (realistic choice)
    // Reach: expectedClosing < rank <= maxPredictedClosing * 1.15 (competitive, requires cutoff movement)
    // Unlikely: rank > maxPredictedClosing * 1.15
    let tier = "unlikely";
    let tierReason = "";

    if (applicableRank <= expectedClosing * 0.85) {
      tier = "safe";
      tierReason = `Your ${examName} rank (${applicableRank.toLocaleString("en-IN")}) sits comfortably inside the historical closing rank of ${historicalClosing.toLocaleString("en-IN")} with an estimated safety margin of +${historicalMargin.toLocaleString("en-IN")} ranks (+${historicalMarginPct}%).`;
    } else if (applicableRank <= expectedClosing) {
      tier = "target";
      tierReason = `Your ${examName} rank (${applicableRank.toLocaleString("en-IN")}) is within the historical closing cutoff of ${historicalClosing.toLocaleString("en-IN")} (gap: +${historicalMargin.toLocaleString("en-IN")} ranks), making this a highly realistic goal.`;
    } else if (applicableRank <= maxPredictedClosing * 1.15) {
      tier = "reach";
      const gap = applicableRank - historicalClosing;
      tierReason = `Competitive option: Your ${examName} rank (${applicableRank.toLocaleString("en-IN")}) is ${gap.toLocaleString("en-IN")} ranks beyond the last observed cutoff (${historicalClosing.toLocaleString("en-IN")}). It falls within the upper predicted cutoff movement range of ${maxPredictedClosing.toLocaleString("en-IN")}.`;
    } else {
      tier = "unlikely";
      const gap = applicableRank - historicalClosing;
      tierReason = `Significantly beyond historical cutoffs (${gap.toLocaleString("en-IN")} ranks higher than last observed closing rank of ${historicalClosing.toLocaleString("en-IN")}).`;
    }

    const recommendationItem = {
      id: traj.id,
      instituteName: traj.instituteName,
      programName: traj.programName,
      instituteType: traj.instituteType,
      examRankType: traj.examRankType,
      examName: traj.examName,
      studentRankUsed: applicableRank,
      closingThresholdStatus,
      quota: traj.quota,
      seatCategory: traj.seatCategory,
      genderPool: traj.genderPool,
      rankType: traj.rankType,
      historicalCutoffs: traj.rounds,
      lastObservedRound: latestObserved.round,
      lastObservedClosingRank: historicalClosing,
      lastObservedOpeningRank: latestObserved.openingRank,
      prediction,
      studentRankComparison: {
        studentRank: applicableRank,
        examName: traj.examName,
        examRankType: traj.examRankType,
        closingThresholdStatus,
        historicalMargin,
        historicalMarginPercentage: historicalMarginPct,
        expectedMargin,
        tier,
        tierReason
      },
      sourceUrl: traj.sourceUrl
    };

    if (tier === "safe") safe.push(recommendationItem);
    else if (tier === "target") target.push(recommendationItem);
    else if (tier === "reach") reach.push(recommendationItem);
    else unlikely.push(recommendationItem);
  }

  // Sort each tier by competitiveness (lowest closing rank first)
  const sortFn = (a, b) =>
    a.lastObservedClosingRank - b.lastObservedClosingRank;
  safe.sort(sortFn);
  target.sort(sortFn);
  reach.sort(sortFn);
  unlikely.sort(sortFn);

  return {
    success: true,
    studentProfile: {
      rank: studentRank,
      rankType: targetRankType,
      examRankType: targetExamRankType,
      seatCategory: targetCategory,
      quota: targetQuota,
      genderPool: targetGender,
      instituteType: targetInstituteType || "All"
    },
    tiers: {
      safe,
      target,
      reach,
      unlikely
    },
    summary: {
      safeCount: safe.length,
      targetCount: target.length,
      reachCount: reach.length,
      unlikelyCount: unlikely.length,
      totalMatched: safe.length + target.length + reach.length + unlikely.length
    },
    disclaimer:
      "CounselX predictions and classifications are rule-based historical comparisons and statistical projections. Seat allocation is governed entirely by official JoSAA counselling rules, real student preference choices and actual candidate turnout. Admission is never guaranteed."
  };
}

module.exports = {
  predictCutoffTrajectory,
  backtestModel,
  generateCounsellingRecommendations
};
