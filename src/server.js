require("dotenv").config();

const express = require("express");
const cors = require("cors");

const app = express();
const wisataRoutes = require("./routes/wisata.routes");

app.use(cors());
app.use(express.json());

app.use("/api", wisataRoutes);
const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`Server running in http://localhost:${port}`);
});
