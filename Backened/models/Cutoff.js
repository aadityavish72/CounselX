
const mongoose = require("mongoose");

const cutoffSchema = new mongoose.Schema(
  {
    year: {
      type: Number,
      // required: true,
      // min: 2000,
      // max: 2100
    },

    round: {
      type: Number,
      required: true,
      min: 1
    },

    instituteType: {
      type: String,
      required: true,
      enum: ["IIT", "NIT", "IIIT", "GFTI"]
    },

    instituteName: {
      type: String,
      required: true,
      trim: true
    },

    programName: {
      type: String,
      required: true,
      trim: true
    },

    quota: {
      type: String,
      required: true,
      trim: true
    },

    seatType: {
      type: String,
      required: true,
      trim: true
    },

    gender: {
      type: String,
      required: true,
      trim: true
    },

    rankType: {
      type: String,
      required: true,
      trim: true
    },

    openingRank: {
      type: Number,
      required: true,
      min: 0
    },

    closingRank: {
      type: Number,
      required: true,
      min: 0
    },

    openingRankRaw: {
      type: String,
      default: null
    },

    closingRankRaw: {
      type: String,
      default: null
    },

    openingRankPreparatory: {
      type: Boolean,
      default: false
    },

    closingRankPreparatory: {
      type: Boolean,
      default: false
    },

    source: {
      type: String,
      default: "JoSAA"
    },

    sourceUrl: {
      type: String,
      default: "https://josaa.admissions.nic.in/"
    }
  },
  {
    timestamps: true
  },
  {
    // strict: false,
    collection: "josaa_cutoff_2026",
    versionKey: false
  }
);

// Query performance improve karne ke liye indexes
cutoffSchema.index({
  year: 1,
  round: 1,
  instituteType: 1
});

cutoffSchema.index({
  instituteName: 1,
  programName: 1,
  seatType: 1,
  gender: 1,
  quota: 1
});

const Cutoff = mongoose.model(
  "Cutoff",
  cutoffSchema,
  "josaa_cutoff_2026"
);

module.exports = Cutoff;

