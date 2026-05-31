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
const frontendOrigin = process.env.FRONTEND_ORIGIN || "http://localhost:3000";

app.use(
  cors({
    origin: frontendOrigin,
    credentials: true,
  }),
);
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
