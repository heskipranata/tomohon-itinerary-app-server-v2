const express = require("express");
const authController = require("../controllers/auth.controller");
const { verifyToken } = require("../middleware/auth.middleware");

const router = express.Router();

router.post("/auth/register", authController.registerUser);
router.post("/auth/login", authController.loginUser);
router.get("/auth/profile", verifyToken, authController.getProfile);
router.patch("/auth/profile", verifyToken, authController.updateMinatKategori);
router.post("/auth/logout", verifyToken, authController.logout);

router.post("/admin/register", authController.registerAdmin);
router.post("/admin/login", authController.loginAdmin);
router.patch("/admin/profile", verifyToken, authController.updateAdminProfile);
router.post("/admin/logout", verifyToken, authController.logout);

module.exports = router;
