const supabase = require("../config/supabase");

function getFirstAvailableValue(source, keys) {
  if (!source || typeof source !== "object") return null;

  for (const key of keys) {
    if (
      Object.prototype.hasOwnProperty.call(source, key) &&
      source[key] !== null &&
      source[key] !== undefined
    ) {
      return source[key];
    }
  }

  return null;
}

function getCoverImageUrl(dataItinerary) {
  const summary = dataItinerary?.summary || {};
  const directCover = getFirstAvailableValue(summary, [
    "coverImageUrl",
    "cover_image_url",
  ]);
  if (directCover) return directCover;

  const recommendedCover = Array.isArray(dataItinerary?.recommendedDestinations)
    ? dataItinerary.recommendedDestinations.find(
        (item) => item && getFirstAvailableValue(item, ["imageUrl", "image_url"]),
      )
    : null;
  const recommendedImage = getFirstAvailableValue(recommendedCover, [
    "imageUrl",
    "image_url",
  ]);
  if (recommendedImage) return recommendedImage;

  const firstWisata = Array.isArray(dataItinerary?.visitList)
    ? dataItinerary.visitList.find(
        (v) => v && v.visitType === "wisata" && v.wisataId,
      )
    : null;

  if (firstWisata?.image || firstWisata?.imageUrl) {
    return firstWisata.image || firstWisata.imageUrl;
  }

  const firstLegacyVisit =
    Array.isArray(dataItinerary?.itineraryByDay) &&
    dataItinerary.itineraryByDay.length > 0
      ? (dataItinerary.itineraryByDay[0]?.visits || []).find(
          (visit) => visit && getFirstAvailableValue(visit, ["imageUrl", "image"]),
        )
      : null;

  const legacyImage = getFirstAvailableValue(firstLegacyVisit, [
    "imageUrl",
    "image",
  ]);
  if (legacyImage) return legacyImage;

  return null;
}

function buildCompactTripSummary(dataItinerary) {
  const visitList = Array.isArray(dataItinerary?.visitList)
    ? dataItinerary.visitList
    : [];

  const itineraryByDay = Array.isArray(dataItinerary?.itineraryByDay)
    ? dataItinerary.itineraryByDay
    : [];
  const simpleItinerary = Array.isArray(dataItinerary?.simpleItinerary)
    ? dataItinerary.simpleItinerary
    : [];
  const recommendedDestinations = Array.isArray(
    dataItinerary?.recommendedDestinations,
  )
    ? dataItinerary.recommendedDestinations
    : [];

  const legacyVisits = itineraryByDay.flatMap((day) =>
    Array.isArray(day?.visits) ? day.visits : [],
  );

  const wisataStops = visitList.filter((v) => v?.visitType === "wisata");
  const foodStops = visitList.filter((v) => v?.visitType === "food");
  const accommodationStops = visitList.filter(
    (v) => v?.visitType === "accommodation",
  );

  const legacyWisataStops = legacyVisits.filter(
    (v) => !v?.isLunchStop && !v?.isAccommodationStop,
  );

  const totalDestinations =
    wisataStops.filter((v) => v?.wisataId).length ||
    recommendedDestinations.filter((item) => item?.sourceType === "objek_wisata").length ||
    legacyWisataStops.filter((v) => getFirstAvailableValue(v, ["destinationId", "id"])).length ||
    simpleItinerary.reduce(
      (count, day) =>
        count +
        (Array.isArray(day?.visits)
          ? day.visits.filter((v) => !v?.isLunchStop && !v?.isAccommodationStop).length
          : 0),
      0,
    );

  const totalStops =
    visitList.length || legacyVisits.length || recommendedDestinations.length || 0;

  const summary = dataItinerary?.summary || {};
  const totalDays =
    summary.totalDays ??
    dataItinerary?.itineraryByDay?.length ??
    dataItinerary?.simpleItinerary?.length ??
    null;

  return {
    totalDays,
    totalStops,
    totalDestinations,
    totalWisataStops: totalDestinations,
    totalFoodStops: foodStops.length,
    totalAccommodationStops: accommodationStops.length,
    totalDistance: summary.totalDistance ?? 0,
    avgDistancePerDay: summary.avgDistancePerDay ?? 0,
    coverImageUrl: getCoverImageUrl(dataItinerary),
  };
}

function buildTripPreviewList(dataItinerary, maxItems = 3) {
  const visitList = Array.isArray(dataItinerary?.visitList)
    ? dataItinerary.visitList
    : [];

  if (visitList.length > 0) {
    return visitList.slice(0, maxItems).map((visit) => ({
      visitOrder: visit.visitOrder,
      dayNumber: visit.dayNumber,
      visitType: visit.visitType,
      wisataId: visit.wisataId || null,
      customName: visit.customName || null,
      startTime: visit.startTime || null,
      duration: visit.duration || null,
    }));
  }

  const itineraryByDay = Array.isArray(dataItinerary?.itineraryByDay)
    ? dataItinerary.itineraryByDay
    : [];

  const fallbackPreview = [];
  for (const day of itineraryByDay) {
    for (const visit of Array.isArray(day?.visits) ? day.visits : []) {
      fallbackPreview.push({
        visitOrder: visit.order ?? null,
        dayNumber: null,
        visitType: visit.isAccommodationStop
          ? "accommodation"
          : visit.isLunchStop
            ? "food"
            : "wisata",
        wisataId: visit.destinationId ?? null,
        customName: visit.destinationName || null,
        startTime: visit.schedule?.visitStartTime || null,
        duration: visit.estimatedVisitDurationMinutes
          ? `${Math.round(visit.estimatedVisitDurationMinutes / 60)}h`
          : null,
      });

      if (fallbackPreview.length >= maxItems) {
        return fallbackPreview;
      }
    }
  }

  return fallbackPreview;
}

/**
 * Service untuk menyimpan rencana perjalanan (Approach 3 - Minimal & Efficient)
 *
 * data_itinerary menyimpan struktur minimal:
 * {
 *   visitList: [
 *     { visitOrder, wisataId, visitType, dayNumber, startTime, duration, distanceFromPrevious }
 *   ],
 *   summary: { totalDays, totalDistance, totalWisataStops, avgDistancePerDay }
 * }
 *
 * Detail wisata (nama, harga, deskripsi, dll) di-fetch dari objek_wisata by wisataId
 * Rute di-hitung dari koordinat yang tersimpan di objek_wisata
 *
 * @param {Object} params
 * @param {string} params.userId - UUID user
 * @param {Object} params.data_itinerary - Struktur minimal visitList + summary
 * @param {string} params.judul_trip - Judul trip
 * @param {string} params.tanggal_mulai - Tanggal mulai (YYYY-MM-DD)
 * @param {number} params.durasi_hari - Durasi hari
 * @returns {Promise<Object>} hasil insert
 */
async function simpanRencanaPerjalanan({
  userId,
  data_itinerary,
  judul_trip,
  tanggal_mulai,
  durasi_hari,
}) {
  if (!userId) {
    throw new Error("userId wajib diisi");
  }
  if (!data_itinerary) {
    throw new Error("data_itinerary wajib diisi");
  }
  if (!data_itinerary.visitList || !Array.isArray(data_itinerary.visitList)) {
    throw new Error("data_itinerary.visitList wajib ada dan harus array");
  }
  if (!judul_trip) {
    throw new Error("judul_trip wajib diisi");
  }
  if (!tanggal_mulai) {
    throw new Error("tanggal_mulai wajib diisi");
  }
  if (!durasi_hari) {
    throw new Error("durasi_hari wajib diisi");
  }

  // Validate tanggal_mulai format (YYYY-MM-DD)
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(tanggal_mulai)) {
    throw new Error("tanggal_mulai harus format YYYY-MM-DD");
  }

  // Validate visitList structure
  if (data_itinerary.visitList.length === 0) {
    throw new Error("visitList wajib memiliki minimal 1 visit");
  }

  // Validate visitType values
  const validTypes = ["wisata", "food", "accommodation"];
  for (const visit of data_itinerary.visitList) {
    if (!validTypes.includes(visit.visitType)) {
      throw new Error(
        `visitType harus salah satu dari: ${validTypes.join(", ")}`,
      );
    }
  }

  // Attempt to set a cover image from the first wisata visit (save-time optimization)
  try {
    const firstWisata = data_itinerary.visitList.find(
      (v) => v && v.visitType === "wisata" && v.wisataId,
    );

    if (firstWisata && firstWisata.wisataId) {
      const { data: fotoRows, error: fotoErr } = await supabase
        .from("objek_wisata")
        .select("url_foto, url_gambar, image_url")
        .eq("id", firstWisata.wisataId)
        .limit(1)
        .single();

      if (!fotoErr && fotoRows) {
        const fotoUrl =
          fotoRows.url_foto ||
          fotoRows.url_gambar ||
          fotoRows.image_url ||
          null;

        data_itinerary.summary = data_itinerary.summary || {};
        data_itinerary.summary.coverImageUrl = fotoUrl;
      }
    }
  } catch (e) {
    // non-fatal: if fetching foto gagal, continue without coverImageUrl
  }

  const insertPayload = {
    user_id: userId,
    judul_trip,
    tanggal_mulai,
    durasi_hari,
    data_itinerary,
    progres_kunjungan: {},
    version: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("rencana_perjalanan")
    .insert([insertPayload])
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function getRencanaPerjalananById({ rencanaId, userId }) {
  if (!rencanaId || !userId) {
    throw new Error("rencanaId dan userId wajib diisi");
  }

  const { data, error } = await supabase
    .from("rencana_perjalanan")
    .select(
      "id, user_id, judul_trip, tanggal_mulai, durasi_hari, data_itinerary, progres_kunjungan",
    )
    .eq("id", rencanaId)
    .eq("user_id", userId)
    .single();

  if (error || !data) {
    throw new Error("Rencana perjalanan tidak ditemukan");
  }

  return data;
}

async function getRencanaPerjalananByUser({ userId }) {
  if (!userId) {
    throw new Error("userId wajib diisi");
  }

  const { data, error } = await supabase
    .from("rencana_perjalanan")
    .select(
      "id, user_id, judul_trip, tanggal_mulai, durasi_hari, data_itinerary, progres_kunjungan, created_at, updated_at",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data || []).map((trip) => {
    const compactSummary = buildCompactTripSummary(trip.data_itinerary);
    const previewList = buildTripPreviewList(trip.data_itinerary);

    return {
      id: trip.id,
      user_id: trip.user_id,
      judul_trip: trip.judul_trip,
      tanggal_mulai: trip.tanggal_mulai,
      durasi_hari: trip.durasi_hari,
      created_at: trip.created_at,
      updated_at: trip.updated_at,
      progres_kunjungan: trip.progres_kunjungan || {},
      summary: compactSummary,
      previewList,
      data_itinerary: {
        summary: compactSummary,
        generatedAt: trip.data_itinerary?.generatedAt || null,
      },
    };
  });
}

async function updateProgresKunjungan({ rencanaId, userId, progresKunjungan }) {
  if (!rencanaId || !userId) {
    throw new Error("rencanaId dan userId wajib diisi");
  }

  const { data, error } = await supabase
    .from("rencana_perjalanan")
    .update({
      progres_kunjungan: progresKunjungan || {},
      updated_at: new Date().toISOString(),
    })
    .eq("id", rencanaId)
    .eq("user_id", userId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

module.exports = {
  simpanRencanaPerjalanan,
  getRencanaPerjalananByUser,
  getRencanaPerjalananById,
  updateProgresKunjungan,
};
