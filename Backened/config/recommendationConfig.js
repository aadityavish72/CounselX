"use strict";

/**
 * CounselX Advanced Recommendation Engine Configuration
 * Configurable weights and classification thresholds
 */
module.exports = {
  // Weights must sum to 1.00
  weights: {
    historicalMatch: 0.50, // 50% weight on historical rank match frequency
    cutoffTrend: 0.25,     // 25% weight on closing rank trend direction
    consistency: 0.15,     // 15% weight on cutoff stability (low variance)
    safetyMargin: 0.10     // 10% weight on student rank vs latest cutoff
  },

  // Minimum required historical data points for full multi-factor score
  minHistoricalDataPoints: 2,

  // Classification Thresholds
  thresholds: {
    safe: {
      minScore: 70,
      minMarginPct: -2.0
    },
    moderate: {
      minScore: 40,
      minMarginPct: -15.0
    },
    ambitious: {
      minScore: 0,
      minMarginPct: -35.0
    }
  },

  // Tier metadata & display labels
  tiers: {
    SAFE: {
      label: "Safe",
      badgeClass: "badge-safe",
      description: "High probability of admission based on historical closing rank trends."
    },
    MODERATE: {
      label: "Moderate",
      badgeClass: "badge-moderate",
      description: "Competitive chance of admission; candidate rank is close to previous cutoffs."
    },
    AMBITIOUS: {
      label: "Ambitious",
      badgeClass: "badge-ambitious",
      description: "Reach option; candidate rank is higher than recent cutoffs but within reach if seats expand."
    },
    INSUFFICIENT_DATA: {
      label: "Insufficient Historical Data",
      badgeClass: "badge-insufficient",
      description: "Limited historical rounds available for reliable trend modeling."
    }
  }
};
