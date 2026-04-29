const express = require("express");

const adminKategoriController = require("../controllers/admin-kategori.controller");
const { verifyToken, requireAdmin } = require("../middleware/auth.middleware");

const router = express.Router();

router.use(verifyToken, requireAdmin);

router.get("/admin/kategori", adminKategoriController.getAdminKategoriList);
router.post("/admin/kategori", adminKategoriController.createAdminKategori);
router.delete(
  "/admin/kategori/:id",
  adminKategoriController.deleteAdminKategori,
);

module.exports = router;
