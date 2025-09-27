const mongoose = require("mongoose");
const dotenv = require("dotenv");
const User = require("./UserSchema");
dotenv.config();

const MONGO_URI =
  process.env.MONGO_URI || "mongodb://localhost:27017/prototype";
mongoose.set("strictQuery", false);

// Enhanced MongoDB connection with better error handling
const connectToMongoDB = async () => {
  try {
    await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 5000, // Timeout after 5 seconds
      connectTimeoutMS: 10000, // Give up initial connection after 10 seconds
    });
    console.log("✅ Successfully connected to MongoDB!");
    console.log(`📍 Database: ${mongoose.connection.name}`);
    console.log(
      `🔗 Host: ${mongoose.connection.host}:${mongoose.connection.port}`
    );
  } catch (err) {
    console.error("❌ MongoDB connection failed:");
    console.error(`   Error: ${err.message}`);
    console.error("   Make sure MongoDB is running on localhost:27017");
    console.error(
      "   You can start MongoDB through MongoDB Compass or run 'mongod' in terminal"
    );
  }
};

// Monitor connection events
mongoose.connection.on("connected", () => {
  console.log("🔄 Mongoose connected to MongoDB");
});

mongoose.connection.on("error", (err) => {
  console.error("💥 Mongoose connection error:", err.message);
});

mongoose.connection.on("disconnected", () => {
  console.log("❌ Mongoose disconnected from MongoDB");
});

module.exports = connectToMongoDB;
