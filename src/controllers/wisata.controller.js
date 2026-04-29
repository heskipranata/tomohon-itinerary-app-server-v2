const itineraryPlannerService = require("../services/itinerary-planner.service");
const itineraryDebugService = require("../services/itinerary-debug.service");

async function getItineraryRecommendation(req, res) {
  try {
    const data = await itineraryPlannerService.buildItineraryRecommendation(
      req.body,
    );

    res.status(200).json({
      message: "Rekomendasi itinerary berhasil dibuat",
      total: data.recommendedDestinations.length,
      data,
    });
  } catch (error) {
    const isInputError =
      /wajib|valid|harus|minimal|format|angka|koordinat/i.test(error.message);

    res.status(isInputError ? 400 : 500).json({
      message: "Gagal membuat rekomendasi itinerary",
      error: error.message,
    });
  }
}

async function getNearestDestinationsDebug(req, res) {
  try {
    const data = await itineraryDebugService.buildNearestDestinationsDebug(
      req.body,
    );

    res.status(200).json({
      message: "Data objek wisata terdekat berhasil diambil",
      total: data.nearestDestinations.length,
      data,
    });
  } catch (error) {
    const isInputError =
      /wajib|valid|harus|minimal|format|angka|koordinat/i.test(error.message);

    res.status(isInputError ? 400 : 500).json({
      message: "Gagal mengambil objek wisata terdekat",
      error: error.message,
    });
  }
}

async function getNearestDestinationsOnlyDebug(req, res) {
  try {
    const data = await itineraryDebugService.buildNearestDestinationsOnlyDebug(
      req.body,
    );

    res.status(200).json({
      message: "Data objek wisata terdekat (nearest-only) berhasil diambil",
      total: data.nearestDestinations.length,
      data,
    });
  } catch (error) {
    const isInputError =
      /wajib|valid|harus|minimal|format|angka|koordinat/i.test(error.message);

    res.status(isInputError ? 400 : 500).json({
      message: "Gagal mengambil nearest-only objek wisata terdekat",
      error: error.message,
    });
  }
}

async function getNearestDestinationsOnlyDebugByCategory(req, res) {
  try {
    const data =
      await itineraryDebugService.buildNearestDestinationsOnlyDebugByCategory(
        req.body,
      );

    res.status(200).json({
      message: "Data objek wisata terdekat (kategori) berhasil diambil",
      total: data.nearestDestinations.length,
      data,
    });
  } catch (error) {
    const isInputError =
      /wajib|valid|harus|minimal|format|angka|koordinat/i.test(error.message);

    res.status(isInputError ? 400 : 500).json({
      message: "Gagal mengambil objek wisata terdekat berdasarkan kategori",
      error: error.message,
    });
  }
}

async function getAvailableWisataCategories(req, res) {
  try {
    const categories =
      await itineraryPlannerService.getAvailableWisataCategories();

    res.status(200).json({
      message: "Daftar kategori objek wisata berhasil diambil",
      total: categories.length,
      data: categories,
    });
  } catch (error) {
    res.status(500).json({
      message: "Gagal mengambil daftar kategori objek wisata",
      error: error.message,
    });
  }
}

async function previewItineraryReplacement(req, res) {
  try {
    const data = await itineraryPlannerService.buildItineraryReplacementPreview(
      req.body,
    );

    res.status(200).json({
      message: "Alternatif pengganti itinerary berhasil dibuat",
      total: data.alternatives.length,
      data,
    });
  } catch (error) {
    const isInputError =
      /wajib|valid|harus|minimal|format|angka|koordinat|draft/i.test(
        error.message,
      );

    res.status(isInputError ? 400 : 500).json({
      message: "Gagal membuat alternatif pengganti itinerary",
      error: error.message,
    });
  }
}

async function confirmItineraryReplacement(req, res) {
  try {
    const data = await itineraryPlannerService.applyItineraryReplacement(
      req.body,
    );

    res.status(200).json({
      message: data.message,
      data,
    });
  } catch (error) {
    const isInputError =
      /wajib|valid|harus|minimal|format|angka|koordinat|draft/i.test(
        error.message,
      );

    res.status(isInputError ? 400 : 500).json({
      message: "Gagal menerapkan penggantian itinerary",
      error: error.message,
    });
  }
}

module.exports = {
  getItineraryRecommendation,
  getNearestDestinationsDebug,
  getNearestDestinationsOnlyDebug,
  getNearestDestinationsOnlyDebugByCategory,
  getAvailableWisataCategories,
  previewItineraryReplacement,
  confirmItineraryReplacement,
};
