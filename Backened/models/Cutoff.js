const mongoose = require("mongoose");

const cutoffSchema = new mongoose.Schema(
  {
    year: {
      type: Number
    },

    round: {
      type: Number,
      required: true,
      min: 1
    },

    instituteType: {
      type: String
    },

    instituteName: {
      type: String,
      trim: true
    },

    institute: {
      type: String,
      trim: true
    },

    programName: {
      type: String,
      trim: true
    },

    academicProgram: {
      type: String,
      trim: true
    },

    degree: {
      type: String,
      trim: true
    },

    durationYears: {
      type: Number
    },

    quota: {
      type: String,
      trim: true
    },

    seatType: {
      type: String,
      trim: true
    },

    seatCategory: {
      type: String,
      trim: true
    },

    gender: {
      type: String,
      trim: true
    },

    genderPool: {
      type: String,
      trim: true
    },

    rankType: {
      type: String,
      trim: true
    },

    examRankType: {
      type: String,
      trim: true
    },

    openingRank: {
      type: Number,
      min: 0
    },

    closingRank: {
      type: Number,
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

    isPreparatoryRank: {
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
    timestamps: true,
    strict: false,
    collection: "josaa_cutoff_2026",
    versionKey: false
  }
);

cutoffSchema.index({
  year: 1,
  round: 1,
  instituteType: 1,
  examRankType: 1
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
