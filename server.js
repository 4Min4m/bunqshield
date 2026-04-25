const express = require("express");
const http = require("http");
const app = express();
const PORT = 3000;

// Proxy /api and /health to FastAPI backend on port 8000
function proxyToBackend(req, res) {
  const options = {
    hostname: "127.0.0.1",
    port: 8000,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: "127.0.0.1:8000" },
  };
  const proxy = http.request(options, (backendRes) => {
    res.writeHead(backendRes.statusCode, backendRes.headers);
    backendRes.pipe(res);
  });
  proxy.on("error", () => res.status(502).json({ error: "Backend unavailable" }));
  req.pipe(proxy);
}

// Proxy must come before static middleware — use all() to preserve full path
app.all("/api/*", proxyToBackend);
app.all("/health", proxyToBackend);

// Serve React SPA
app.use(express.static("public"));

// SPA fallback — all unmatched routes serve index.html
app.get("*", (req, res) => {
  res.sendFile("index.html", { root: "public" });
});

// Error handling
app.use((err, req, res, next) => {
  console.error("Server error:", err);
  res.status(500).json({ status: "error", message: "Internal server error" });
});

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`BunqShield serving on http://0.0.0.0:${PORT}`);
});

process.on("SIGTERM", () => server.close(() => process.exit(0)));
process.on("SIGINT", () => server.close(() => process.exit(0)));
