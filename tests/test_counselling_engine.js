const path = require('path');
module.paths.push(path.join(__dirname, '../Backened/node_modules'));
require('dotenv').config({ path: path.join(__dirname, '../Backened/.env') });
const connectDB = require('../Backened/db');
const Cutoff = require('../Backened/models/Cutoff');
const mongoose = require('mongoose');
const {
  predictCutoffTrajectory,
  backtestModel,
  generateCounsellingRecommendations
} = require('../Backened/services/counsellingEngine');

async function testEngine() {
  console.log('=== Counselling & Prediction Engine Verification on Real Atlas Data ===\n');

  await connectDB();

  const results = [];
  function assert(name, condition, details = '') {
    results.push({ name, passed: !!condition, details });
    console.log(`[${condition ? 'PASS' : 'FAIL'}] ${name}${details ? ` -> ${details}` : ''}`);
  }

  try {
    // -------------------------------------------------------------
    // TEST 1: Trajectory Prediction & Uncertainty Calculation
    // -------------------------------------------------------------
    console.log('--- 1. Testing Trajectory Prediction & Uncertainty ---');

    // Case 1A: Single round observation (data sufficiency check)
    const singleRoundData = [{ round: 1, openingRank: 1200, closingRank: 2500 }];
    const predSingle = predictCutoffTrajectory(singleRoundData, 5);
    assert(
      'Data-sufficiency check on 1 round (flags INSUFFICIENT)',
      predSingle.dataSufficiency === 'INSUFFICIENT' && predSingle.confidenceLevel === 'LOW',
      `dataSufficiency: ${predSingle.dataSufficiency}, confidence: ${predSingle.confidenceLevel}`
    );

    // Case 1B: Multi-round progression on real college (IIT Bhubaneswar)
    const realRounds = await Cutoff.find({
      $and: [
        { $or: [{ instituteName: 'Indian Institute of Technology Bhubaneswar' }, { institute: 'Indian Institute of Technology Bhubaneswar' }] },
        { quota: 'AI' },
        { $or: [{ seatType: 'OPEN' }, { seatCategory: 'OPEN' }] },
        { $or: [{ gender: 'Gender-Neutral' }, { genderPool: 'Gender-Neutral' }] }
      ]
    }).sort({ round: 1 }).lean();

    assert(
      'Retrieved actual multi-round progression for IIT Bhubaneswar',
      realRounds.length >= 5,
      `found ${realRounds.length} actual rounds from MongoDB Atlas`
    );

    const predIIT = predictCutoffTrajectory(realRounds, 5);
    assert(
      'Multi-round trajectory prediction generates valid range [min <= expected <= max]',
      predIIT.dataSufficiency === 'SUFFICIENT' &&
      predIIT.predictedRange.min <= predIIT.predictedRange.expected &&
      predIIT.predictedRange.expected <= predIIT.predictedRange.max,
      `Range: [${predIIT.predictedRange.min}, ${predIIT.predictedRange.expected}, ${predIIT.predictedRange.max}], Uncertainty: ${predIIT.uncertaintyScore}%, Confidence: ${predIIT.confidenceLevel}`
    );

    // -------------------------------------------------------------
    // TEST 2: Backtesting on Actual JoSAA Historical Data
    // -------------------------------------------------------------
    console.log('\n--- 2. Testing Empirical Backtesting on Live Database ---');

    // Aggregate multi-round trajectories across all institutes
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
          _id: { inst: "$inst", prog: "$prog", quota: "$quota", seat: "$seat", gender: "$gender", rankType: "$rankType" },
          rounds: { $push: { round: "$round", closingRank: "$closingRank", openingRank: "$openingRank" } },
          count: { $sum: 1 }
        }
      },
      { $match: { count: { $gte: 3 } } }
    ]);

    assert('Found multi-round trajectories for backtesting', rawTrajectories.length >= 200, `found ${rawTrajectories.length} trajectories`);

    // Backtest: Train on rounds <= 2, predict Round 5
    const backtestResult = backtestModel(rawTrajectories, 2);
    console.log(`\nBacktest Evaluation Results:`);
    console.log(`  Total Trajectories Evaluated: ${backtestResult.totalEvaluated}`);
    console.log(`  Hit Rate (% actual within predicted [min, max]): ${backtestResult.hitRate}%`);
    console.log(`  Mean Absolute Percentage Error (MAPE): ${backtestResult.meanAbsolutePercentageError}%`);
    console.log(`  Sample evaluations:`);
    backtestResult.sampleEvaluations.slice(0, 3).forEach(s => {
      console.log(`    - ${s.institute} (${s.category}, ${s.quota}): Actual = ${s.actualFinalClosing}, Pred = [${s.predictedRange.min} - ${s.predictedRange.max}], In Range: ${s.inRange}, Error: ${s.percentageError}%`);
    });

    assert(
      'Backtesting achieves high predictive hit-rate (> 80%) on real JoSAA data',
      backtestResult.hitRate >= 80,
      `achieved ${backtestResult.hitRate}% hit-rate with ${backtestResult.meanAbsolutePercentageError}% MAPE`
    );

    // -------------------------------------------------------------
    // TEST 3: Student Counselling Recommendations
    // -------------------------------------------------------------
    console.log('\n--- 3. Testing Student Counselling Recommendations ---');

    const allRecords = await Cutoff.find({}).lean();

    // Test Profile 1: General Category, AI Quota, CRL Rank 4,500
    const profile1 = {
      rank: 4500,
      rankType: 'CRL',
      seatCategory: 'OPEN',
      quota: 'AI',
      genderPool: 'Gender-Neutral',
      instituteType: 'IIT'
    };

    const recs1 = generateCounsellingRecommendations(profile1, allRecords);
    assert(
      'Recommendations generated for CRL Rank 4,500',
      recs1.success && recs1.summary.totalMatched > 0,
      `Safe: ${recs1.summary.safeCount}, Target: ${recs1.summary.targetCount}, Reach: ${recs1.summary.reachCount}`
    );

    // Verify all recommended records match profile's rankType, category, quota
    const allTiers1 = [...recs1.tiers.safe, ...recs1.tiers.target, ...recs1.tiers.reach];
    const strictMatch1 = allTiers1.every(r =>
      r.seatCategory === 'OPEN' &&
      r.quota === 'AI' &&
      r.genderPool === 'Gender-Neutral' &&
      r.rankType === 'CRL' &&
      r.instituteType === 'IIT'
    );
    assert(
      'Strict allotment matching: All recommended records strictly match student category, quota, gender pool, rank type',
      strictMatch1,
      'every single recommendation adheres to exact eligibility'
    );

    // Verify explainable reasoning
    const sampleRec1 = recs1.tiers.target[0] || recs1.tiers.safe[0];
    assert(
      'Explainable reasoning provided for recommendation',
      !!sampleRec1.studentRankComparison.tierReason && !!sampleRec1.prediction.explanation,
      `Reason: "${sampleRec1.studentRankComparison.tierReason}"`
    );

    // Test Profile 2: OBC-NCL Category, Category Rank 1,500
    const profile2 = {
      rank: 1500,
      rankType: 'Category Rank',
      seatCategory: 'OBC-NCL',
      quota: 'AI',
      genderPool: 'Gender-Neutral',
      instituteType: 'IIT'
    };

    const recs2 = generateCounsellingRecommendations(profile2, allRecords);
    assert(
      'Category Rank matching for OBC-NCL Rank 1,500',
      recs2.success && recs2.summary.totalMatched > 0,
      `Safe: ${recs2.summary.safeCount}, Target: ${recs2.summary.targetCount}, Reach: ${recs2.summary.reachCount}`
    );
    const allTiers2 = [...recs2.tiers.safe, ...recs2.tiers.target, ...recs2.tiers.reach];
    const strictMatch2 = allTiers2.every(r =>
      r.seatCategory === 'OBC-NCL' &&
      r.rankType === 'Category Rank'
    );
    assert(
      'Category Rank strict matching verified (never mixes with CRL)',
      strictMatch2,
      'all records match OBC-NCL Category Rank'
    );

    // Summary
    const totalCount = results.length;
    const passedCount = results.filter(r => r.passed).length;
    console.log(`\n==============================================`);
    console.log(`Counselling Engine Tests: ${passedCount} of ${totalCount} PASSED`);
    console.log(`==============================================`);

    if (passedCount < totalCount) {
      process.exitCode = 1;
    }
  } catch (err) {
    console.error('Test execution error:', err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

testEngine();
