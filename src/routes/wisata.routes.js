const express = require("express");
const router = express.Router();

const wisataController = require("../controllers/wisata.controller");

router.get("/objek-wisata", wisataController.getWisata);

module.exports = router;