const express = require("express");
const router = express.Router();

const wisataController = require("../controllers/wisata.controller");
const { verifyToken, requireAdmin } = require("../middleware/auth.middleware");

router.post(
  "/objek-wisata/rekomendasi-itinerary",
  verifyToken,
  wisataController.getItineraryRecommendation,
);

router.post(
  "/objek-wisata/rekomendasi-itinerary/replacement-preview",
  verifyToken,
  wisataController.previewItineraryReplacement,
);

router.post(
  "/objek-wisata/rekomendasi-itinerary/replacement-confirm",
  verifyToken,
  wisataController.confirmItineraryReplacement,
);

router.get(
  "/rencana-perjalanan",
  verifyToken,
  wisataController.getRencanaPerjalananUser,
);

router.get(
  "/rencana-perjalanan/:id",
  verifyToken,
  wisataController.getRencanaPerjalananById,
);

router.post(
  "/rencana-perjalanan",
  verifyToken,
  wisataController.saveRencanaPerjalanan,
);

router.patch(
  "/rencana-perjalanan/:id/progres-kunjungan",
  verifyToken,
  wisataController.updateRencanaPerjalananProgress,
);

router.post(
  "/objek-wisata/debug/terdekat",
  wisataController.getNearestDestinationsDebug,
);

router.post(
  "/objek-wisata/debug/terdekat-only",
  wisataController.getNearestDestinationsOnlyDebug,
);

router.post(
  "/objek-wisata/debug/terdekat-only/kategori",
  wisataController.getNearestDestinationsOnlyDebugByCategory,
);

router.get(
  "/objek-wisata/kategori-tersedia",
  wisataController.getAvailableWisataCategories,
);

router.get(
  "/objek-wisata/rekomendasi-minat",
  verifyToken,
  wisataController.getWisataForUserMinat,
);

router.get(
  "/objek-wisata",
  wisataController.getObjekWisataBatch,
);

router.get(
  "/objek-wisata/kurasi/:section",
  wisataController.getCuratedWisataForUser,
);

router.get(
  "/objek-wisata/populer",
  (req, _res, next) => {
    req.params.section = "populer";
    next();
  },
  wisataController.getCuratedWisataForUser,
);

router.get(
  "/objek-wisata/wisata-populer",
  (req, _res, next) => {
    req.params.section = "populer";
    next();
  },
  wisataController.getCuratedWisataForUser,
);

router.get(
  "/objek-wisata/hidden-gem",
  (req, _res, next) => {
    req.params.section = "hidden_gem";
    next();
  },
  wisataController.getCuratedWisataForUser,
);

router.get(
  "/objek-wisata/wisata-hidden-gem",
  (req, _res, next) => {
    req.params.section = "hidden_gem";
    next();
  },
  wisataController.getCuratedWisataForUser,
);

router.get(
  "/objek-wisata/wisata-baru",
  (req, _res, next) => {
    req.params.section = "baru";
    next();
  },
  wisataController.getCuratedWisataForUser,
);

module.exports = router;
