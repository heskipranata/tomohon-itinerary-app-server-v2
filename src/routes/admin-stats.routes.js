const express = require("express");

const adminStatsController = require("../controllers/admin-stats.controller");
const { verifyToken, requireAdmin } = require("../middleware/auth.middleware");

const router = express.Router();

router.use(verifyToken, requireAdmin);

router.get("/admin/stats", adminStatsController.getAdminStats);

module.exports = router;
