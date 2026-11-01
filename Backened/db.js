
const mongoose = require("mongoose");

async function connectDB() {
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.DB_NAME || "counselx";

  if (!uri) {
    throw new Error("MONGODB_URI .env file mein missing hai.");
  }

  await mongoose.connect(uri, {
    dbName,
    serverSelectionTimeoutMS: 10000
  });

  console.log("MongoDB Atlas connected successfully.");
  console.log("Database:", mongoose.connection.name);
}

module.exports = connectDB;
