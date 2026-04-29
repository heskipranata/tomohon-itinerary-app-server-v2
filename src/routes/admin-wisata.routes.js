const express = require("express");

const adminWisataController = require("../controllers/admin-wisata.controller");
const { verifyToken, requireAdmin } = require("../middleware/auth.middleware");

const router = express.Router();

router.use(verifyToken, requireAdmin);

router.get("/admin/wisata", adminWisataController.getAdminWisataList);
router.get("/admin/wisata/:id", adminWisataController.getAdminWisataById);
router.post("/admin/wisata", adminWisataController.createAdminWisata);
router.patch("/admin/wisata/:id", adminWisataController.updateAdminWisata);
router.delete("/admin/wisata/:id", adminWisataController.deleteAdminWisata);

module.exports = router;
