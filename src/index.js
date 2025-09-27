const dotenv = require("dotenv");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const path = require("path");
const chatRoutes = require("./routes/chatRoutes");
const noteRoutes = require("./routes/noteRoutes");
const cardsRoutes = require("./routes/cardsRoutes");
const connectToMongoDB = require("./config/db");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000; // Render will inject its own PORT
const NODE_ENV = process.env.NODE_ENV || "development";

// Basic security & logging middleware
app.set('trust proxy', 1); // allow correct protocol / IP when behind Render proxy
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',') || '*'}));
app.use(express.json({ limit: process.env.JSON_LIMIT || "1mb" }));
app.use(morgan(NODE_ENV === 'production' ? 'combined' : 'dev'));

// Static hosting for public assets (cardsFinal.html, notesFinal.html, etc.)
app.use(express.static(path.join(__dirname, "public"))); // serve /src/public
app.use(express.static(path.join(__dirname, ".."))); // fallback root (optional)

// DB
connectToMongoDB();

// Log key environment expectations (without secrets)
if (NODE_ENV !== 'production') {
  console.log('Environment check:', {
    PORT,
    NODE_ENV,
    hasGroqKey: Boolean(process.env.GROQ_API_KEY),
    mongoUriDefined: Boolean(process.env.MONGO_URI),
  });
}

// Routes
app.use(chatRoutes);
app.use(noteRoutes);
app.use(cardsRoutes);

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    mongoState: require("mongoose").connection.readyState,
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Not Found" });
});

// Central error handler (last)
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(err.status || 500).json({ error: 'Internal Server Error' });
});

const server = app.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});

// Graceful shutdown
async function shutdown(signal){
  console.log(`\n${signal} received. Shutting down gracefully...`);
  server.close(async () => {
    try {
      const mongoose = require('mongoose');
      await mongoose.connection.close(false);
      console.log('Mongo connection closed. Bye 👋');
      process.exit(0);
    } catch (e) {
      console.error('Error during Mongo close', e);
      process.exit(1);
    }
  });
  // Force exit after 10s regardless
  setTimeout(()=>process.exit(1), 10000).unref();
}
['SIGINT','SIGTERM'].forEach(sig=>process.on(sig, ()=>shutdown(sig)));
