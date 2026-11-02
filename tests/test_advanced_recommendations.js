"use strict";

const assert = require("assert");
const path = require("path");
module.paths.push(path.join(__dirname, "../Backened/node_modules"));
require("dotenv").config({ path: path.join(__dirname, "../Backened/.env") });

const connectDB = require("../Backened/db");
const Cutoff = require("../Backened/models/Cutoff");
const {
  calculateHistoricalMatch,
  calculateCutoffTrend,
  calculateConsistency,
  calculateSafetyMargin,
  calculateCompositeScore,
  classifyRecommendation,
  getAdvancedRecommendations
} = require("../Backened/services/advancedRecommendationService");

async function runTests() {
  console.log("=== CounselX Module B: Advanced Recommendation System Tests ===");
  let passed = 0;
  let total = 0;

  function test(name, fn) {
    total++;
    try {
      fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (e) {
      console.error(`  ✗ ${name}:`, e.message);
    }
  }

  async function testAsync(name, fn) {
    total++;
    try {
      await fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (e) {
      console.error(`  ✗ ${name}:`, e.message);
    }
  }

  // 1. Historical Match calculation
  test("1. Historical match rate calculation", () => {
    const history = [
      { closingRank: 4000 },
      { closingRank: 4500 },
      { closingRank: 5000 },
      { closingRank: 5500 }
    ];
    // Student rank 4200 is <= 4500, 5000, 5500 (3 of 4 matches = 75%)
    const res = calculateHistoricalMatch(history, 4200);
    assert.strictEqual(res.matches, 3);
    assert.strictEqual(res.total, 4);
    assert.strictEqual(res.score, 75);
  });

  // 2. Trend Slope calculation
  test("2. Cutoff trend slope calculation (relaxing)", () => {
    const history = [
      { year: 2026, round: 1, closingRank: 1000 },
      { year: 2026, round: 5, closingRank: 1200 } // +20% increase
    ];
    const trend = calculateCutoffTrend(history);
    assert.strictEqual(trend.direction, "Relaxing");
    assert.strictEqual(trend.changePct, 20);
    assert.ok(trend.score > 50, "Score should be > 50 for relaxing cutoff");
  });

  // 3. Consistency calculation
  test("3. Consistency CV calculation", () => {
    const history = [
      { closingRank: 5000 },
      { closingRank: 5050 },
      { closingRank: 5020 }
    ];
    const cons = calculateConsistency(history);
    assert.ok(cons.cv < 5, "CV should be under 5% for highly stable cutoffs");
    assert.ok(cons.consistencyPct > 95, "Consistency % should be > 95%");
    assert.strictEqual(cons.isConsistent, true);
  });

  // 4. Safety Margin calculation
  test("4. Safety margin calculation", () => {
    // latest closing = 10000, student rank = 9000 -> margin = +1000 (+10%)
    const margin = calculateSafetyMargin(10000, 9000);
    assert.strictEqual(margin.margin, 1000);
    assert.strictEqual(margin.marginPct, 10);
    assert.strictEqual(margin.score, 70); // 50 + (10 * 2) = 70
  });

  // 5. Composite Score weighting: 50% match + 25% trend + 15% cons + 10% margin
  test("5. Composite score 4-factor formula (50/25/15/10)", () => {
    // 0.50 * 100 + 0.25 * 80 + 0.15 * 90 + 0.10 * 70 = 50 + 20 + 13.5 + 7 = 90.5
    const composite = calculateCompositeScore(100, 80, 90, 70);
    assert.strictEqual(composite, 90.5);
  });

  // 6. Tier classification
  test("6. Tier classification thresholds", () => {
    assert.strictEqual(classifyRecommendation(85, 10, 3), "SAFE");
    assert.strictEqual(classifyRecommendation(55, -5, 3), "MODERATE");
    assert.strictEqual(classifyRecommendation(30, -20, 3), "AMBITIOUS");
    assert.strictEqual(classifyRecommendation(90, 20, 1), "INSUFFICIENT_DATA");
  });

  // 7. Live Database Integration: NIT recommendation using JEE Main rank
  await testAsync("7. Live Atlas NIT recommendations using JEE Main rank", async () => {
    await connectDB();
    const result = await getAdvancedRecommendations({
      jeeMainRank: 12000,
      instituteTypes: ["NIT"],
      category: "OPEN",
      gender: "Gender-Neutral"
    });
    assert.ok(result.summary.totalEvaluated > 0, "Should evaluate NIT trajectories");
    assert.strictEqual(result.summary.studentRanksUsed.jeeMainRank, 12000);
    assert.strictEqual(result.summary.studentRanksUsed.jeeAdvancedRank, null);
    console.log(`     Total evaluated: ${result.summary.totalEvaluated}, Safe: ${result.safe.length}, Moderate: ${result.moderate.length}, Ambitious: ${result.ambitious.length}`);
    if (result.safe.length > 0) {
      assert.strictEqual(result.safe[0].examRankType, "JEE_MAIN");
    }
  });

  // 8. Live Database Integration: IIT recommendation using JEE Advanced rank
  await testAsync("8. Live Atlas IIT recommendations using JEE Advanced rank", async () => {
    const result = await getAdvancedRecommendations({
      jeeAdvancedRank: 2500,
      instituteTypes: ["IIT"],
      category: "OPEN",
      gender: "Gender-Neutral"
    });
    assert.ok(result.summary.totalEvaluated > 0, "Should evaluate IIT trajectories");
    assert.strictEqual(result.summary.studentRanksUsed.jeeAdvancedRank, 2500);
    assert.strictEqual(result.summary.studentRanksUsed.jeeMainRank, null);
    console.log(`     Total evaluated: ${result.summary.totalEvaluated}, Safe: ${result.safe.length}, Moderate: ${result.moderate.length}, Ambitious: ${result.ambitious.length}`);
    if (result.safe.length > 0) {
      assert.strictEqual(result.safe[0].examRankType, "JEE_ADVANCED");
    }
  });

  // 9. Live Database Integration: Dual Ranks (JEE Main + JEE Advanced simultaneous query)
  await testAsync("9. Live Atlas Dual Ranks query (Main + Advanced simultaneously)", async () => {
    const result = await getAdvancedRecommendations({
      jeeMainRank: 8500,
      jeeAdvancedRank: 3200,
      instituteTypes: ["IIT", "NIT", "IIIT", "GFTI"],
      category: "OPEN"
    });
    assert.ok(result.summary.totalEvaluated > 0);
    assert.strictEqual(result.summary.studentRanksUsed.jeeMainRank, 8500);
    assert.strictEqual(result.summary.studentRanksUsed.jeeAdvancedRank, 3200);

    // Verify all IIT results used 3200 (Advanced) and all NIT results used 8500 (Main)
    const all = [...result.safe, ...result.moderate, ...result.ambitious, ...result.insufficientData];
    for (const item of all) {
      if (item.instituteType === "IIT") {
        assert.strictEqual(item.studentRank, 3200, "IIT must use JEE Advanced rank");
        assert.strictEqual(item.examRankType, "JEE_ADVANCED");
      } else {
        assert.strictEqual(item.studentRank, 8500, "NIT/IIIT/GFTI must use JEE Main rank");
        assert.strictEqual(item.examRankType, "JEE_MAIN");
      }
    }
  });

  // 10. Rejection of invalid rank
  await testAsync("10. Reject missing or non-positive ranks", async () => {
    let errorCaught = false;
    try {
      await getAdvancedRecommendations({
        jeeMainRank: -50,
        jeeAdvancedRank: "invalid"
      });
    } catch (e) {
      errorCaught = true;
    }
    assert.strictEqual(errorCaught, true, "Should reject negative or invalid ranks");
  });

  console.log(`\n==================================================`);
  console.log(`Module B Tests Completed: ${passed}/${total} Passed.`);
  console.log(`==================================================`);

  if (passed === total) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error("Test runner failed:", err);
  process.exit(1);
});
