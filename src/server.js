require("dotenv").config();

const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");

const app = express();
const wisataRoutes = require("./routes/wisata.routes");
const authRoutes = require("./routes/auth.routes")

app.use(cors());
app.use(express.json());
app.use(cookieParser());

app.use("/api", wisataRoutes);
app.use("/api", authRoutes);

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`Server running in http://localhost:${port}`);
});

