const express = require("express");

const adminTempatMakanController = require("../controllers/admin-tempat-makan.controller");
const { verifyToken, requireAdmin } = require("../middleware/auth.middleware");

const router = express.Router();

router.use(verifyToken, requireAdmin);

router.get(
  "/admin/tempat-makan",
  adminTempatMakanController.getAdminTempatMakanList,
);
router.get(
  "/admin/tempat-makan/:id",
  adminTempatMakanController.getAdminTempatMakanById,
);
router.post(
  "/admin/tempat-makan",
  adminTempatMakanController.createAdminTempatMakan,
);
router.patch(
  "/admin/tempat-makan/:id",
  adminTempatMakanController.updateAdminTempatMakan,
);
router.delete(
  "/admin/tempat-makan/:id",
  adminTempatMakanController.deleteAdminTempatMakan,
);

module.exports = router;
