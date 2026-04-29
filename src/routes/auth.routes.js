const express = require("express");
const authController = require("../controllers/auth.controller");

const router = express.Router();

router.post("/auth/register", authController.registerUser);
router.post("/auth/login", authController.loginUser);
router.post("/auth/logout", authController.logout);

router.post("/admin/login", authController.loginAdmin);
router.post("/admin/logout", authController.logout);

module.exports = router;
