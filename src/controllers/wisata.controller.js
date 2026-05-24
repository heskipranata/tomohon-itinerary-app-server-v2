const itineraryPlannerService = require("../services/itinerary-planner.service");
const itineraryDebugService = require("../services/itinerary-debug.service");
const authService = require("../services/auth.service");
const userWisataService = require("../services/user-wisata.service");
const curatedWisataService = require("../services/curated-wisata.service");
const rencanaPerjalananService = require("../services/rencana-perjalanan.service");
const supabase = require("../config/supabase");

const CURATED_SECTION_ALIASES = {
  populer: "populer",
  popular: "populer",
  hidden_gem: "hidden_gem",
  hiddengem: "hidden_gem",
  hidden: "hidden_gem",
  kurang_populer_bagus: "hidden_gem",
  bagus_kurang_populer: "hidden_gem",
  baru: "baru",
  new: "baru",
  wisata_baru: "baru",
};

function isUuid(value) {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

async function resolveRencanaUserId(user) {
  const email = String(user?.email || "")
    .trim()
    .toLowerCase();
  if (!email) {
    throw new Error("User login tidak memiliki email untuk sinkronisasi UUID");
  }

  const { data, error } = await supabase.auth.admin.listUsers();
  if (error) {
    throw new Error(error.message);
  }

  const matchedUser = (data?.users || []).find(
    (item) =>
      String(item.email || "")
        .trim()
        .toLowerCase() === email,
  );

  if (!matchedUser?.id) {
    if (isUuid(user?.id)) {
      return user.id;
    }
    throw new Error("User auth UUID belum tersedia untuk email ini");
  }

  return matchedUser.id;
}

function detectVisitType(visitName, destinationIds) {
  if (!visitName) return "wisata";

  const name = String(visitName).toLowerCase();

  // Food keywords
  const foodKeywords = [
    "resto",
    "restaurant",
    "makan",
    "kuliner",
    "cafe",
    "food",
    "warung",
    "bakery",
  ];
  if (foodKeywords.some((kw) => name.includes(kw))) {
    return "food";
  }

  // Accommodation keywords
  const accomKeywords = [
    "hotel",
    "akomodasi",
    "penginapan",
    "villa",
    "homestay",
    "guest",
    "resort",
    "lodge",
    "inn",
    "cottage",
    "bed",
  ];
  if (accomKeywords.some((kw) => name.includes(kw))) {
    return "accommodation";
  }

  return "wisata";
}

function extractVisitListFromItinerary(itinerary) {
  if (!itinerary || !Array.isArray(itinerary.itineraryByDay)) {
    throw new Error("Itinerary harus memiliki itineraryByDay array");
  }

  const visitList = [];
  const recommendedDestinationIds = new Set(
    (itinerary.recommendedDestinations || []).map((d) => d.id),
  );

  let visitOrder = 0;

  itinerary.itineraryByDay.forEach((day, dayIdx) => {
    if (!Array.isArray(day.visits)) return;

    day.visits.forEach((visit) => {
      visitOrder += 1;

      const visitType = detectVisitType(
        visit.nama || visit.name,
        recommendedDestinationIds,
      );

      visitList.push({
        visitOrder,
        wisataId: visit.id || null,
        visitType,
        dayNumber: dayIdx + 1,
        startTime: visit.time || "00:00",
        duration: visit.durasi || "01:00",
        distanceFromPrevious: visit.distance || 0,
        ...(visitType !== "wisata" && visit.nama && { customName: visit.nama }),
      });
    });
  });

  if (visitList.length === 0) {
    throw new Error("Tidak ada visits ditemukan dalam itinerary");
  }

  return visitList;
}

function normalizeCuratedSection(input) {
  const raw = String(input || "")
    .trim()
    .toLowerCase();

  const normalized = CURATED_SECTION_ALIASES[raw];

  if (!normalized) {
    throw new Error(
      "section tidak valid. Gunakan: populer | hidden_gem | baru",
    );
  }

  return normalized;
}

function parseLimit(limitValue) {
  if (limitValue === undefined) {
    return 5;
  }

  const limit = Number(limitValue);

  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error("limit harus berupa angka bulat positif");
  }

  return Math.min(limit, 50);
}

function sectionLabel(section) {
  if (section === "populer") return "populer";
  if (section === "hidden_gem") return "bagus tapi kurang populer";
  return "wisata baru";
}

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

async function getWisataForUserMinat(req, res) {
  try {
    const profile = await authService.getUserProfileById(req.user.id);
    const data = await userWisataService.getWisataByPreferences(
      profile.minat_kategori,
    );

    res.status(200).json({
      message: "Wisata sesuai minat user berhasil diambil",
      total: data.total,
      minatKategori: profile.minat_kategori,
      data: data.wisata,
    });
  } catch (error) {
    res.status(500).json({
      message: "Gagal mengambil wisata sesuai minat user",
      error: error.message,
    });
  }
}

async function getCuratedWisataForUser(req, res) {
  try {
    const section = normalizeCuratedSection(req.params.section);
    const limit = parseLimit(req.query.limit);
    const data = await curatedWisataService.getCuratedWisataBySection(
      section,
      limit,
    );

    res.status(200).json({
      message: `Daftar wisata ${sectionLabel(section)} berhasil diambil`,
      section,
      total: data.length,
      data,
    });
  } catch (error) {
    const isInputError = /section|valid|limit|angka/i.test(error.message);

    res.status(isInputError ? 400 : 500).json({
      message: "Gagal mengambil daftar wisata kurasi",
      error: error.message,
    });
  }
}

async function getObjekWisataBatch(req, res) {
  try {
    const idsRaw = String(req.query.ids || "").trim();
    if (!idsRaw) {
      throw new Error("Query param 'ids' wajib diisi (contoh: ids=1,2,3)");
    }

    const ids = idsRaw
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    if (ids.length === 0) {
      throw new Error("Query param 'ids' tidak berisi id yang valid");
    }

    const maxIds = 200;
    if (ids.length > maxIds) {
      throw new Error(`Too many ids; max ${maxIds} allowed per request`);
    }

    const fieldsRaw = String(req.query.fields || "").trim();
    const defaultFields = [
      "id",
      "nama",
      "deskripsi",
      "lat",
      "lon",
      "harga_tiket",
      "jam_buka",
      "jam_tutup",
      "url_foto",
    ];

    const selectFields = fieldsRaw
      ? fieldsRaw
          .split(/[,\s]+/)
          .map((f) => f.trim())
          .filter((f) => f.length > 0)
      : defaultFields;

    const { data, error } = await supabase
      .from("objek_wisata")
      .select(selectFields.join(","))
      .in("id", ids);

    if (error) throw error;

    res.status(200).json({
      message: "Detail objek wisata (batch) berhasil diambil",
      total: (data || []).length,
      data,
    });
  } catch (error) {
    const isInputError = /wajib|valid|Too many ids|id yang valid/i.test(
      error.message,
    );
    res.status(isInputError ? 400 : 500).json({
      message: "Gagal mengambil objek wisata (batch)",
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

async function saveRencanaPerjalanan(req, res) {
  try {
    const rencanaUserId = await resolveRencanaUserId(req.user);

    // Validasi input
    if (!req.body.itinerary || typeof req.body.itinerary !== "object") {
      throw new Error("Itinerary wajib ada dan harus berupa object");
    }
    if (!req.body.judul_trip || typeof req.body.judul_trip !== "string") {
      throw new Error("judul_trip wajib ada dan harus berupa string");
    }
    if (!req.body.tanggal_mulai || typeof req.body.tanggal_mulai !== "string") {
      throw new Error(
        "tanggal_mulai wajib ada dan harus berupa string (YYYY-MM-DD)",
      );
    }
    if (
      !req.body.durasi_hari ||
      !Number.isFinite(req.body.durasi_hari) ||
      req.body.durasi_hari < 1
    ) {
      throw new Error("durasi_hari wajib ada dan harus berupa number >= 1");
    }

    // Extract minimal visitList dari itinerary lengkap
    const visitList = extractVisitListFromItinerary(req.body.itinerary);

    // Buat summary dari itinerary
    const summary = req.body.itinerary.travelMetrics || {
      totalDays: req.body.durasi_hari,
      totalDistance: 0,
      totalWisataStops: visitList.filter((v) => v.visitType === "wisata")
        .length,
      avgDistancePerDay: 0,
    };

    // Data yang akan disimpan: minimal + efficient
    const data_itinerary = {
      visitList,
      summary,
      generatedAt: new Date().toISOString(),
    };

    const data = await rencanaPerjalananService.simpanRencanaPerjalanan({
      userId: rencanaUserId,
      data_itinerary,
      judul_trip: req.body.judul_trip,
      tanggal_mulai: req.body.tanggal_mulai,
      durasi_hari: req.body.durasi_hari,
    });

    res.status(201).json({
      message: "Rencana perjalanan berhasil disimpan",
      data,
    });
  } catch (error) {
    const isInputError =
      /wajib|valid|harus|minimal|format|angka|koordinat|draft|object|string|number|visits/i.test(
        error.message,
      );

    res.status(isInputError ? 400 : 500).json({
      message: "Gagal menyimpan rencana perjalanan",
      error: error.message,
    });
  }
}

async function getRencanaPerjalananUser(req, res) {
  try {
    const userId = await resolveRencanaUserId(req.user);
    const data = await rencanaPerjalananService.getRencanaPerjalananByUser({
      userId,
    });

    res.status(200).json({
      message: "Daftar rencana perjalanan berhasil diambil",
      data,
    });
  } catch (error) {
    const isInputError = /wajib|valid|harus|email|UUID/i.test(error.message);

    res.status(isInputError ? 400 : 500).json({
      message: "Gagal mengambil daftar rencana perjalanan",
      error: error.message,
    });
  }
}

async function getRencanaPerjalananById(req, res) {
  try {
    const userId = await resolveRencanaUserId(req.user);
    const rencanaId = String(req.params.id || "").trim();

    if (!rencanaId) {
      throw new Error("id rencana perjalanan wajib diisi");
    }

    const data = await rencanaPerjalananService.getRencanaPerjalananById({
      rencanaId,
      userId,
    });

    res.status(200).json({
      message: "Rencana perjalanan berhasil diambil",
      data,
    });
  } catch (error) {
    const isInputError =
      /wajib|valid|harus|rencana perjalanan tidak ditemukan/i.test(
        error.message,
      );

    res.status(isInputError ? 400 : 500).json({
      message: "Gagal mengambil rencana perjalanan",
      error: error.message,
    });
  }
}

async function updateRencanaPerjalananProgress(req, res) {
  try {
    const rencanaUserId = await resolveRencanaUserId(req.user);
    const rencanaId = String(req.params.id || "").trim();
    const leaveLastUnvisitedCountRaw = Number(
      req.body.leaveLastUnvisitedCount ?? 2,
    );

    if (!rencanaId) {
      throw new Error("id rencana perjalanan wajib diisi");
    }

    if (
      !Number.isFinite(leaveLastUnvisitedCountRaw) ||
      leaveLastUnvisitedCountRaw < 0
    ) {
      throw new Error("leaveLastUnvisitedCount harus berupa angka >= 0");
    }

    const rencana = await rencanaPerjalananService.getRencanaPerjalananById({
      rencanaId,
      userId: rencanaUserId,
    });

    const itineraryByDay = Array.isArray(
      rencana?.data_itinerary?.itineraryByDay,
    )
      ? rencana.data_itinerary.itineraryByDay
      : [];

    const tourismVisits = itineraryByDay.flatMap((dayPlan) => {
      const visits = Array.isArray(dayPlan?.visits) ? dayPlan.visits : [];
      return visits.filter(
        (visit) => !visit?.isLunchStop && !visit?.isAccommodationStop,
      );
    });

    const leaveLastUnvisitedCount = Math.min(
      tourismVisits.length,
      Math.floor(leaveLastUnvisitedCountRaw),
    );
    const visitedVisits = tourismVisits.slice(
      0,
      tourismVisits.length - leaveLastUnvisitedCount,
    );

    const visitedStopIds = visitedVisits
      .map((visit) => visit?.destinationId)
      .filter((id) => id !== null && id !== undefined);
    const visitedStopIdTextSet = new Set(
      visitedStopIds.map((id) => String(id)),
    );

    const byDay = {};
    for (const dayPlan of itineraryByDay) {
      const dateKey = dayPlan?.date || "unknown-date";
      const visits = Array.isArray(dayPlan?.visits) ? dayPlan.visits : [];
      const dayTourismIds = visits
        .filter((visit) => !visit?.isLunchStop && !visit?.isAccommodationStop)
        .map((visit) => visit?.destinationId)
        .filter((id) => id !== null && id !== undefined);

      const completedStopIds = dayTourismIds.filter((id) =>
        visitedStopIdTextSet.has(String(id)),
      );

      let status = "not_started";
      if (
        dayTourismIds.length > 0 &&
        completedStopIds.length === dayTourismIds.length
      ) {
        status = "completed";
      } else if (completedStopIds.length > 0) {
        status = "in_progress";
      }

      byDay[dateKey] = {
        status,
        completedStopIds,
        totalStops: dayTourismIds.length,
      };
    }

    const progresKunjungan = {
      totalStops: tourismVisits.length,
      visitedStopIds,
      remainingStops: leaveLastUnvisitedCount,
      byDay,
      lastVisitedAt: visitedVisits.length > 0 ? new Date().toISOString() : null,
    };

    const updated = await rencanaPerjalananService.updateProgresKunjungan({
      rencanaId,
      userId: rencanaUserId,
      progresKunjungan,
    });

    res.status(200).json({
      message:
        "Progres kunjungan berhasil diupdate (menyisakan wisata terakhir sesuai parameter)",
      data: {
        id: updated.id,
        user_id: updated.user_id,
        judul_trip: updated.judul_trip,
        progres_kunjungan: updated.progres_kunjungan,
      },
    });
  } catch (error) {
    const isInputError =
      /wajib|valid|harus|minimal|format|angka|rencana perjalanan tidak ditemukan/i.test(
        error.message,
      );

    res.status(isInputError ? 400 : 500).json({
      message: "Gagal mengupdate progres kunjungan",
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
  getWisataForUserMinat,
  getCuratedWisataForUser,
  previewItineraryReplacement,
  confirmItineraryReplacement,
  saveRencanaPerjalanan,
  getRencanaPerjalananUser,
  getRencanaPerjalananById,
  updateRencanaPerjalananProgress,
  getObjekWisataBatch,
};
