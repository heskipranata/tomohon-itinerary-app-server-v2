const express = require("express");
const router = express.Router();

const wisataController = require("../controllers/wisata.controller");
const { verifyToken, requireAdmin } = require("../middleware/auth.middleware");

router.post(
  "/objek-wisata/rekomendasi-itinerary",
  wisataController.getItineraryRecommendation,
);

router.post(
  "/objek-wisata/rekomendasi-itinerary/replacement-preview",
  wisataController.previewItineraryReplacement,
);

router.post(
  "/objek-wisata/rekomendasi-itinerary/replacement-confirm",
  wisataController.confirmItineraryReplacement,
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

module.exports = router;
