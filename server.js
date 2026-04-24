const express = require("express");
const app = express();
const PORT = 3000;

// Middleware
app.use(express.static("public"));

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "npm-dev-server",
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Main endpoint
app.get("/", (req, res) => {
  res.json({
    status: "healthy",
    message: "NPM dev server running",
    timestamp: new Date().toISOString(),
    port: PORT,
    uptime: process.uptime()
  });
});

// Error handling
app.use((err, req, res, next) => {
  console.error("Server error:", err);
  res.status(500).json({
    status: "error",
    message: "Internal server error"
  });
});

// Start server
const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`Dev server running on http://0.0.0.0:${PORT}`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("Received SIGTERM, shutting down gracefully");
  server.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  console.log("Received SIGINT, shutting down gracefully");
  server.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
});
