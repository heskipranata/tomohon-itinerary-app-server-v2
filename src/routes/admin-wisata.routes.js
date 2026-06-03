const express = require("express");

const adminWisataController = require("../controllers/admin-wisata.controller");
const { verifyToken, requireAdmin } = require("../middleware/auth.middleware");
const uploadController = require("../controllers/upload.controller");
const multerUpload = require("../config/upload.middleware");

const router = express.Router();

router.use(verifyToken, requireAdmin);

router.post(
  "/admin/upload",
  multerUpload.single("image"),
  uploadController.uploadImage,
);

router.get("/admin/wisata", adminWisataController.getAdminWisataList);
router.get("/admin/wisata/:id", adminWisataController.getAdminWisataById);
router.get(
  "/admin/wisata/kurasi/:section",
  adminWisataController.getAdminCuratedWisataSection,
);
router.post("/admin/wisata", adminWisataController.createAdminWisata);
router.put(
  "/admin/wisata/kurasi/:section",
  adminWisataController.replaceAdminCuratedWisataSection,
);
router.patch("/admin/wisata/:id", adminWisataController.updateAdminWisata);
router.patch(
  "/admin/wisata/:id/popularity",
  adminWisataController.updateAdminWisataPopularity,
);
router.delete("/admin/wisata/:id", adminWisataController.deleteAdminWisata);

module.exports = router;
