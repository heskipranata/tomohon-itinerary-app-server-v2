require("dotenv").config();

const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");

const wisataRoutes = require("./routes/wisata.routes");
const authRoutes = require("./routes/auth.routes");
const adminWisataRoutes = require("./routes/admin-wisata.routes");
const adminKategoriRoutes = require("./routes/admin-kategori.routes");
const adminTempatMakanRoutes = require("./routes/admin-tempat-makan.routes");
const adminAkomodasiRoutes = require("./routes/admin-akomodasi.routes");
const adminStatsRoutes = require("./routes/admin-stats.routes");

const app = express();

const defaultAllowedOrigins = [
  "http://localhost:3000",
  "http://localhost:5173",
  "https://tomohon-itinerary-app.vercel.app",
  "https://tomohon-itinerary-app-admin.vercel.app",
];

const configuredOrigins = String(process.env.FRONTEND_ORIGIN || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const allowedOrigins = Array.from(
  new Set([...defaultAllowedOrigins, ...configuredOrigins]),
);

const corsOptions = {
  origin(origin, callback) {
    // Allow non-browser requests (no Origin header), e.g. curl/Postman.
    if (!origin) {
      callback(null, true);
      return;
    }

    if (
      allowedOrigins.includes(origin) ||
      origin.endsWith(".vercel.app")
    ) {
      callback(null, true);
      return;
    }

    callback(new Error(`Origin ${origin} tidak diizinkan oleh CORS`));
  },
  credentials: true,
};

app.use(cors(corsOptions));
app.use(express.json({ limit: "10mb" }));
app.use(cookieParser());

app.use("/api", wisataRoutes);
app.use("/api", authRoutes);
app.use("/api", adminWisataRoutes);
app.use("/api", adminKategoriRoutes);
app.use("/api", adminTempatMakanRoutes);
app.use("/api", adminAkomodasiRoutes);
app.use("/api", adminStatsRoutes);

module.exports = app;
