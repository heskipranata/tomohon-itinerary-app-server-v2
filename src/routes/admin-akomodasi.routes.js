const express = require("express");

const adminAkomodasiController = require("../controllers/admin-akomodasi.controller");
const { verifyToken, requireAdmin } = require("../middleware/auth.middleware");

const router = express.Router();

router.use(verifyToken, requireAdmin);

router.get("/admin/akomodasi", adminAkomodasiController.getAdminAkomodasiList);
router.get(
  "/admin/akomodasi/:id",
  adminAkomodasiController.getAdminAkomodasiById,
);
router.post("/admin/akomodasi", adminAkomodasiController.createAdminAkomodasi);
router.patch(
  "/admin/akomodasi/:id",
  adminAkomodasiController.updateAdminAkomodasi,
);
router.delete(
  "/admin/akomodasi/:id",
  adminAkomodasiController.deleteAdminAkomodasi,
);

module.exports = router;
