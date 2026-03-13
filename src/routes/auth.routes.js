const express = require("express");
const authController = require("../controllers/auth.controller");

const router = express.Router();

router.post("/admin/login", authController.loginAdmin);
router.post("/admin/logout", authController.logoutAdmin)

module.exports = router;
