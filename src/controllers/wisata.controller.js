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

function formatMinutesToDurationText(minutesValue) {
  const minutes = Number(minutesValue);
  if (!Number.isFinite(minutes) || minutes < 0) return null;

  const totalMinutes = Math.round(minutes);
  const hours = Math.floor(totalMinutes / 60);
  const remainderMinutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(remainderMinutes).padStart(2, "0")}`;
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
      // visitOrder adalah urutan absolut yang terus bertambah lintas hari (1, 2, 3, dst.)
      visitOrder += 1;

      // 1. TANGKAP ID DENGAN AMAN: Dukung angka (25) maupun string ("tempat-makan-81")
      const destinationId =
        visit.destinationId ??
        visit.id ??
        visit.wisataId ??
        visit.stopId ??
        null;

      const destinationName =
        visit.destinationName ?? visit.nama ?? visit.name ?? null;

      // 2. KUNCI UTAMA (PRIMARY KEY): Wajibkan menjadi String yang bersih
      const stopInstanceId = String(
        visit.stopInstanceId ?? visit.visitOrder ?? visit.order ?? visitOrder,
      ).trim();

      const sourceType =
        visit.sourceType ??
        (visit.isAccommodationStop
          ? "akomodasi"
          : visit.isLunchStop
            ? "tempat_makan"
            : "objek_wisata");

      const visitStartTime = visit.schedule?.visitStartTime
        ? toClockTextFromIso(visit.schedule.visitStartTime)
        : visit.time || "00:00";

      const visitEndTime = visit.schedule?.visitEndTime
        ? toClockTextFromIso(visit.schedule.visitEndTime)
        : null;

      const durationMinutes =
        visit.finalVisitDurationMinutes ??
        visit.estimatedVisitDurationMinutes ??
        visit.visitDurationMinutes ??
        null;

      const durationText = visit.duration
        ? String(visit.duration)
        : formatMinutesToDurationText(durationMinutes) || "01:00";

      const visitType =
        sourceType === "tempat_makan"
          ? "food"
          : sourceType === "akomodasi"
            ? "accommodation"
            : detectVisitType(destinationName, recommendedDestinationIds);

      const customName = visitType !== "wisata" ? destinationName : null;
      const snapshotFacilities = normalizeFacilitiesList(
        visit.facilities ?? visit.fasilitas ?? visit.facility,
      );

      // 3. CETAK KE DATABASE: Struktur diseragamkan agar mudah dibaca oleh Frontend & API Progress
      visitList.push({
        stopInstanceId, // [KUNCI UTAMA] Penghubung mutlak dengan progres_kunjungan
        visitOrder, // Urutan absolut
        destinationId, // ID asli (angka / string)
        wisataId: destinationId, // (Fallback) Menjaga kompabilitas aplikasi lama

        dayNumber: dayIdx + 1,
        visitType, // Kategori kunjungan
        stopType: visitType, // [TAMBAHAN ALIAS] Disamakan persis dengan field di progres_kunjungan
        sourceType,

        destinationName,
        ...(customName ? { customName } : {}), // Hanya masukkan customName jika ada

        startTime: visitStartTime,
        endTime: visitEndTime,
        duration: durationText,
        estimatedVisitDurationMinutes: durationMinutes,

        distanceFromPrevious: visit.travel?.distanceKm ?? visit.distance ?? 0,
        description: visit.description ?? visit.deskripsi ?? null,
        imageUrl: visit.imageUrl ?? visit.coverImageUrl ?? null,
        locationLabel: visit.locationLabel ?? visit.alamat ?? null,

        category: visit.category ?? visit.kategori ?? null,
        categories: Array.isArray(visit.categories) ? visit.categories : [],
        facilities: snapshotFacilities,

        ticketPrice:
          visit.ticketPrice ?? visit.harga_tiket ?? visit.hargaTiket ?? null,
        rating: visit.rating ?? null,
        phoneNumber: visit.phoneNumber ?? visit.nomor_telepon ?? null,
        operatingHours:
          visit.operatingHours?.text ??
          visit.operatingHoursText ??
          visit.jam_operasional ??
          null,

        parkingPaid: Boolean(visit.parkingPaid),
        parkingFee: visit.parkingFee ?? visit.biaya_parkir ?? null,
        biaya_parkir: visit.parkingFee ?? visit.biaya_parkir ?? null,
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

function parseOperatingHoursRange(value) {
  const text = String(value || "").trim();
  if (!text) return { jamBuka: null, jamTutup: null };

  const match = text.match(/(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/);
  if (!match) return { jamBuka: null, jamTutup: null };

  return { jamBuka: match[1], jamTutup: match[2] };
}

function normalizeFacilitiesList(value) {
  if (value === null || value === undefined) return [];

  const addToken = (target, token) => {
    const text = String(token || "").trim();
    if (!text) return;
    const lowered = text.toLowerCase();
    if (!target.some((item) => item.toLowerCase() === lowered)) {
      target.push(text);
    }
  };

  const result = [];

  if (Array.isArray(value)) {
    value.forEach((item) => {
      if (Array.isArray(item)) {
        item.forEach((nested) => addToken(result, nested));
        return;
      }
      addToken(result, item);
    });
    return result;
  }

  if (typeof value === "object") {
    Object.entries(value).forEach(([key, v]) => {
      if (v === true || v === 1 || String(v).toLowerCase() === "true") {
        addToken(result, key);
      }
    });
    return result;
  }

  const rawText = String(value).trim();
  if (!rawText) return [];

  if (
    (rawText.startsWith("[") && rawText.endsWith("]")) ||
    (rawText.startsWith("{") && rawText.endsWith("}"))
  ) {
    try {
      const parsed = JSON.parse(rawText);
      return normalizeFacilitiesList(parsed);
    } catch (_error) {
      // ignore JSON parse error and continue with token split
    }
  }

  rawText
    .split(/[\n,;|/]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .forEach((item) => addToken(result, item));

  return result;
}

function extractParkingInfo(row, facilitiesList) {
  const read = (...keys) => {
    for (const key of keys) {
      if (
        Object.prototype.hasOwnProperty.call(row || {}, key) &&
        row[key] !== null &&
        row[key] !== undefined
      ) {
        return row[key];
      }
    }
    return null;
  };

  const parseBoolean = (value) => {
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value !== 0;
    if (typeof value !== "string") return null;

    const lowered = value.trim().toLowerCase();
    if (["true", "1", "ya", "yes", "berbayar", "paid"].includes(lowered)) {
      return true;
    }
    if (["false", "0", "tidak", "no", "gratis", "free"].includes(lowered)) {
      return false;
    }
    return null;
  };

  const parkingRaw = read(
    "biaya_parkir",
    "parking_fee",
    "tarif_parkir",
    "parkir_fee",
  );
  const parkingFee = parkingRaw !== null ? String(parkingRaw).trim() : null;

  const paidFlag = parseBoolean(
    read("parkir_berbayar", "is_paid_parking", "paid_parking", "parkir_paid"),
  );

  const joinedFacilities = (facilitiesList || []).join(" ").toLowerCase();
  const hasParkingMention = /parkir/.test(joinedFacilities);
  const hasPaidMention = /(berbayar|bayar|paid|rp\.?\s*\d+)/.test(
    joinedFacilities,
  );

  const parkingAvailable =
    hasParkingMention || paidFlag === true || Boolean(parkingFee);
  const parkingPaid =
    paidFlag === null
      ? Boolean(parkingFee || (hasParkingMention && hasPaidMention))
      : paidFlag;

  return {
    parkingAvailable,
    parkingPaid,
    parkingFee: parkingPaid ? parkingFee : null,
  };
}

function normalizePublicWisataRow(row) {
  if (!row) return null;

  const name =
    row.nama_objek_wisata || row.nama || row.name || row.nama_destinasi || null;
  const description = row.deskripsi || row.description || null;
  const locationLabel = row.lokasi || row.alamat || row.address || null;
  const latitude = row.latitude ?? row.lat ?? null;
  const longitude = row.longitude ?? row.lng ?? row.lon ?? null;
  const ticketPrice =
    row.tiket_masuk ?? row.harga_tiket ?? row.ticket_price ?? null;
  const imageUrl =
    row.url_foto || row.url_gambar || row.image_url || row.image || null;
  const operatingHours = row.jam_operasional || row.operating_hours || null;
  const { jamBuka, jamTutup } = parseOperatingHoursRange(operatingHours);
  const facilities = normalizeFacilitiesList(
    row.fasilitas ?? row.facilities ?? row.facility,
  );
  const parking = extractParkingInfo(row, facilities);

  return {
    id: row.id,
    name,
    nama: name,
    nama_objek_wisata: name,
    description,
    deskripsi: description,
    locationLabel,
    alamat: locationLabel,
    latitude,
    longitude,
    lat: latitude,
    lon: longitude,
    ticketPrice,
    harga_tiket: ticketPrice,
    operatingHours,
    jam_operasional: operatingHours,
    jam_buka: jamBuka,
    jam_tutup: jamTutup,
    imageUrl,
    coverImageUrl: imageUrl,
    category: row.kategori ?? row.category ?? null,
    kategori: row.kategori ?? row.category ?? null,
    isOpen: row.is_buka ?? row.is_open ?? null,
    facilities,
    parkingAvailable: parking.parkingAvailable,
    parkingPaid: parking.parkingPaid,
    parkingFee: parking.parkingFee,
    biaya_parkir: parking.parkingFee,
    raw: row,
  };
}

function normalizePublicTempatMakanRow(row) {
  if (!row) return null;

  const name = row.nama || row.name || null;
  const description = row.deskripsi || row.description || null;
  const locationLabel = row.alamat || row.lokasi || row.address || null;
  const latitude = row.latitude ?? row.lat ?? null;
  const longitude = row.longitude ?? row.lng ?? row.lon ?? null;
  const imageUrl =
    row.url_gambar || row.url_foto || row.image_url || row.image || null;
  const rating = row.rating ?? row.rate ?? row.stars ?? null;
  const operatingHours = row.jam_operasional || row.operating_hours || null;
  const { jamBuka, jamTutup } = parseOperatingHoursRange(operatingHours);
  const facilities = normalizeFacilitiesList(
    row.fasilitas ?? row.facilities ?? row.facility,
  );
  const parking = extractParkingInfo(row, facilities);

  return {
    id: row.id,
    name,
    nama: name,
    description,
    deskripsi: description,
    locationLabel,
    alamat: locationLabel,
    latitude,
    longitude,
    lat: latitude,
    lon: longitude,
    rating,
    ticketPrice: null,
    harga_tiket: null,
    operatingHours,
    jam_operasional: operatingHours,
    jam_buka: jamBuka,
    jam_tutup: jamTutup,
    imageUrl,
    coverImageUrl: imageUrl,
    category: row.kategori ?? row.category ?? null,
    kategori: row.kategori ?? row.category ?? null,
    facilities,
    parkingAvailable: parking.parkingAvailable,
    parkingPaid: parking.parkingPaid,
    parkingFee: parking.parkingFee,
    biaya_parkir: parking.parkingFee,
    phoneNumber: null,
    sourceType: "tempat_makan",
    raw: row,
  };
}

function normalizePublicAkomodasiRow(row) {
  if (!row) return null;

  const name = row.nama || row.name || null;
  const description = row.deskripsi || row.description || null;
  const locationLabel = row.alamat || row.lokasi || row.address || null;
  const latitude = row.latitude ?? row.lat ?? null;
  const longitude = row.longitude ?? row.lng ?? row.lon ?? null;
  const imageUrl =
    row.url_gambar || row.url_foto || row.image_url || row.image || null;
  const rating = row.rating ?? row.rate ?? row.stars ?? null;
  const phoneNumber =
    row.nomor_telepon ||
    row.phone_number ||
    row.phone ||
    row.telp ||
    row.no_telp ||
    null;
  const operatingHours = row.jam_operasional || row.operating_hours || null;
  const { jamBuka, jamTutup } = parseOperatingHoursRange(operatingHours);
  const facilities = normalizeFacilitiesList(
    row.fasilitas ?? row.facilities ?? row.facility,
  );
  const parking = extractParkingInfo(row, facilities);

  return {
    id: row.id,
    name,
    nama: name,
    description,
    deskripsi: description,
    locationLabel,
    alamat: locationLabel,
    latitude,
    longitude,
    lat: latitude,
    lon: longitude,
    rating,
    ticketPrice: null,
    harga_tiket: null,
    operatingHours,
    jam_operasional: operatingHours,
    jam_buka: jamBuka,
    jam_tutup: jamTutup,
    imageUrl,
    coverImageUrl: imageUrl,
    category: row.kategori ?? row.category ?? null,
    kategori: row.kategori ?? row.category ?? null,
    facilities,
    parkingAvailable: parking.parkingAvailable,
    parkingPaid: parking.parkingPaid,
    parkingFee: parking.parkingFee,
    biaya_parkir: parking.parkingFee,
    phoneNumber,
    sourceType: "akomodasi",
    raw: row,
  };
}

function buildBatchSelectFields(fieldsRaw, defaultFields, allowedFields) {
  const requested = String(fieldsRaw || "")
    .trim()
    .split(/[,\s]+/)
    .map((field) => field.trim())
    .filter(Boolean);

  const sourceFields = requested.length > 0 ? requested : defaultFields;
  const allowedSet = new Set(Array.isArray(allowedFields) ? allowedFields : []);

  if (allowedSet.size === 0) {
    return sourceFields;
  }

  return sourceFields.filter((field) => allowedSet.has(field));
}

function pickRequestedFields(record, fieldsRaw) {
  if (!fieldsRaw) return record;

  const fields = fieldsRaw
    .split(/[,\s]+/)
    .map((field) => field.trim())
    .filter(Boolean);

  if (fields.length === 0) return record;

  return fields.reduce((acc, field) => {
    if (Object.prototype.hasOwnProperty.call(record, field)) {
      acc[field] = record[field];
    }
    return acc;
  }, {});
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

function toClockTextFromIso(isoValue) {
  if (!isoValue) return null;
  const date = new Date(isoValue);
  if (Number.isNaN(date.getTime())) return null;

  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function toDepartureClockText(visit) {
  const visitStartIso = visit?.schedule?.visitStartTime;
  if (!visitStartIso) return null;

  const visitStart = new Date(visitStartIso);
  if (Number.isNaN(visitStart.getTime())) return null;

  const travelSlotMinutes = Number(visit?.travel?.estimatedTravelSlotMinutes);
  const safeTravelSlot = Number.isFinite(travelSlotMinutes)
    ? Math.max(0, Math.ceil(travelSlotMinutes))
    : 0;
  const departure = new Date(visitStart.getTime() - safeTravelSlot * 60000);
  return toClockTextFromIso(departure.toISOString());
}

function buildSimpleComparisonItinerary(itinerary) {
  const itineraryByDay = Array.isArray(itinerary?.itineraryByDay)
    ? itinerary.itineraryByDay
    : [];

  return itineraryByDay.map((dayPlan, dayIndex) => ({
    hariKe: dayIndex + 1,
    tanggal: dayPlan?.date || null,
    jadwal: Array.isArray(dayPlan?.visits)
      ? dayPlan.visits.map((visit, visitIndex) => ({
          urutan: visitIndex + 1,
          destinationId: visit?.destinationId ?? null,
          sourceType: visit?.sourceType || null,
          jamPergi: toDepartureClockText(visit),
          jamMulaiKunjungan: toClockTextFromIso(
            visit?.schedule?.visitStartTime,
          ),
          jamSelesaiKunjungan: toClockTextFromIso(
            visit?.schedule?.visitEndTime,
          ),
          tujuan: visit?.destinationName || null,
          estimasiJarakKm: visit?.travel?.distanceKm ?? null,
          estimasiWaktuTempuhMenit:
            visit?.travel?.estimatedTravelMinutes ?? null,
          kategori: visit?.category || null,
          kategoriList: Array.isArray(visit?.categories)
            ? visit.categories
            : [],
          jamOperasional: visit?.operatingHours?.text || null,
          tipeStop: visit?.isAccommodationStop
            ? "akomodasi"
            : visit?.isLunchStop
              ? "tempat-makan"
              : "wisata",
          waitingMinutes: visit?.schedule?.waitingMinutes ?? 0,
        }))
      : [],
  }));
}

function normalizeItineraryDays(payload) {
  const source = payload?.itinerary || payload?.data || payload;

  if (Array.isArray(source)) {
    return source;
  }

  if (Array.isArray(source?.itineraryByDay)) {
    return source.itineraryByDay;
  }

  throw new Error("itinerary wajib berupa array hari atau itineraryByDay");
}

function normalizeVisitList(dayPlan) {
  if (Array.isArray(dayPlan?.jadwal)) {
    return dayPlan.jadwal;
  }

  if (Array.isArray(dayPlan?.visits)) {
    return dayPlan.visits;
  }

  return [];
}

function getFirstAvailableValue(source, keys) {
  for (const key of keys) {
    if (
      source &&
      Object.prototype.hasOwnProperty.call(source, key) &&
      source[key] !== null &&
      source[key] !== undefined
    ) {
      return source[key];
    }
  }

  return null;
}

function resolveEnrichTarget(visit) {
  const destinationId = visit?.destinationId ?? visit?.wisataId ?? null;
  const rawSourceType = String(visit?.sourceType || visit?.tipeStop || "")
    .trim()
    .toLowerCase();
  const idText = String(destinationId ?? "").trim();

  if (!idText) {
    return null;
  }

  if (rawSourceType === "objek_wisata" || rawSourceType === "wisata") {
    return {
      tableName: "objek_wisata",
      rawId: destinationId,
      sourceType: "objek_wisata",
    };
  }

  if (rawSourceType === "tempat_makan" || rawSourceType === "food") {
    const rawId = idText.startsWith("tempat-makan-")
      ? idText.replace(/^tempat-makan-/, "")
      : destinationId;
    return { tableName: "tempat_makan", rawId, sourceType: "tempat_makan" };
  }

  if (
    rawSourceType === "akomodasi" ||
    rawSourceType === "hotel" ||
    rawSourceType === "tempat_menginap"
  ) {
    const rawId = idText.startsWith(`${rawSourceType}-`)
      ? idText.replace(new RegExp(`^${rawSourceType}-`), "")
      : idText.replace(/^(akomodasi|hotel|tempat_menginap)-/, "");
    return {
      tableName: rawSourceType,
      rawId,
      sourceType: rawSourceType,
    };
  }

  if (idText.startsWith("tempat-makan-")) {
    return {
      tableName: "tempat_makan",
      rawId: idText.replace(/^tempat-makan-/, ""),
      sourceType: "tempat_makan",
    };
  }

  if (
    idText.startsWith("akomodasi-") ||
    idText.startsWith("hotel-") ||
    idText.startsWith("tempat_menginap-")
  ) {
    const tableName = idText.startsWith("akomodasi-")
      ? "akomodasi"
      : idText.startsWith("hotel-")
        ? "hotel"
        : "tempat_menginap";
    return {
      tableName,
      rawId: idText.replace(/^(akomodasi|hotel|tempat_menginap)-/, ""),
      sourceType: tableName,
    };
  }

  return {
    tableName: "objek_wisata",
    rawId: destinationId,
    sourceType: "objek_wisata",
  };
}

function normalizeEnrichedRow(row, tableName) {
  if (!row) return null;

  const kategori = getFirstAvailableValue(row, ["kategori", "category"]);
  const alamat = getFirstAvailableValue(row, ["alamat", "lokasi", "address"]);
  const jamBuka = getFirstAvailableValue(row, ["jam_buka", "open_time"]);
  const jamTutup = getFirstAvailableValue(row, ["jam_tutup", "close_time"]);
  const jamOperasionalRaw = getFirstAvailableValue(row, [
    "jam_operasional",
    "operating_hours",
  ]);

  return {
    id: row.id,
    sourceTable: tableName,
    name: getFirstAvailableValue(row, ["nama", "name"]) || null,
    description:
      getFirstAvailableValue(row, ["deskripsi", "description"]) || null,
    category: kategori || null,
    locationLabel: alamat || null,
    rating: getFirstAvailableValue(row, ["rating", "rate", "stars"]) || null,
    phoneNumber:
      getFirstAvailableValue(row, [
        "nomor_telepon",
        "phone_number",
        "phone",
        "telp",
        "no_telp",
      ]) || null,
    imageUrl:
      getFirstAvailableValue(row, [
        "url_foto",
        "url_gambar",
        "image_url",
        "image",
        "foto",
      ]) || null,
    latitude: getFirstAvailableValue(row, ["latitude", "lat"]) ?? null,
    longitude: getFirstAvailableValue(row, ["longitude", "lng", "lon"]) ?? null,
    jamOperasional:
      jamOperasionalRaw ||
      (jamBuka || jamTutup ? `${jamBuka || "--"} - ${jamTutup || "--"}` : null),
    raw: row,
  };
}

async function getItineraryEnrichment(req, res) {
  try {
    const days = normalizeItineraryDays(req.body);
    const targets = [];
    const groupedByTable = new Map();

    days.forEach((dayPlan, dayIndex) => {
      const visits = normalizeVisitList(dayPlan);

      visits.forEach((visit, visitIndex) => {
        const target = resolveEnrichTarget(visit);
        if (!target) return;

        const rawIdText = String(target.rawId ?? "").trim();
        if (!rawIdText) return;

        const rawId = Number.isNaN(Number(rawIdText))
          ? rawIdText
          : Number(rawIdText);
        const tableName = target.tableName;
        const grouped = groupedByTable.get(tableName) || new Map();
        grouped.set(String(rawId), true);
        groupedByTable.set(tableName, grouped);

        targets.push({
          dayIndex,
          visitIndex,
          rawId: String(rawId),
          tableName,
          sourceType: target.sourceType,
        });
      });
    });

    const rowsByTable = new Map();

    for (const [tableName, idMap] of groupedByTable.entries()) {
      const ids = Array.from(idMap.keys()).map((value) =>
        Number.isNaN(Number(value)) ? value : Number(value),
      );

      if (ids.length === 0) continue;

      const { data, error } = await supabase
        .from(tableName)
        .select("*")
        .in("id", ids);

      if (error) throw error;

      const rowMap = new Map((data || []).map((row) => [String(row.id), row]));
      rowsByTable.set(tableName, rowMap);
    }

    const enrichedDays = days.map((dayPlan, dayIndex) => {
      const visits = normalizeVisitList(dayPlan);

      const enrichedVisits = visits.map((visit, visitIndex) => {
        const target = resolveEnrichTarget(visit);
        if (!target) {
          return {
            ...visit,
            detail: null,
            enrichStatus: "missing-reference",
          };
        }

        const rawIdText = String(target.rawId ?? "").trim();
        const key = Number.isNaN(Number(rawIdText))
          ? rawIdText
          : String(Number(rawIdText));
        const row = rowsByTable.get(target.tableName)?.get(key) || null;

        return {
          ...visit,
          destinationId: visit?.destinationId ?? visit?.wisataId ?? null,
          sourceType: target.sourceType,
          detail: row ? normalizeEnrichedRow(row, target.tableName) : null,
          enrichStatus: row ? "enriched" : "not-found",
          enrichTable: target.tableName,
          enrichKey: key,
        };
      });

      return {
        ...dayPlan,
        hariKe: dayPlan?.hariKe ?? dayIndex + 1,
        jadwal: enrichedVisits,
      };
    });

    const totalVisits = targets.length;
    const enrichedVisits = enrichedDays.reduce(
      (sum, day) =>
        sum +
        normalizeVisitList(day).filter(
          (visit) => visit?.enrichStatus === "enriched",
        ).length,
      0,
    );

    res.status(200).json({
      message: "Data itinerary berhasil dienrich",
      totalHari: enrichedDays.length,
      totalVisit: totalVisits,
      enrichedVisit: enrichedVisits,
      missingVisit: Math.max(0, totalVisits - enrichedVisits),
      data: enrichedDays,
    });
  } catch (error) {
    const isInputError =
      /wajib|valid|harus|minimal|format|angka|itinerary/i.test(error.message);

    res.status(isInputError ? 400 : 500).json({
      message: "Gagal melakukan enrich itinerary",
      error: error.message,
    });
  }
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

async function getItineraryRecommendationSimple(req, res) {
  try {
    const data = await itineraryPlannerService.buildItineraryRecommendation(
      req.body,
    );

    const itinerarySederhana = buildSimpleComparisonItinerary(data);

    res.status(200).json({
      message: "Rekomendasi itinerary sederhana berhasil dibuat",
      totalHari: itinerarySederhana.length,
      inputPembanding: {
        preferensi: Array.isArray(req.body?.jenisWisata)
          ? req.body.jenisWisata
          : req.body?.jenisWisata || req.body?.preferences || null,
        jumlahHariWisata:
          req.body?.jumlahHariWisata || req.body?.travelDays || null,
        jamAktif: {
          mulai:
            req.body?.jamMulai ||
            req.body?.startHour ||
            req.body?.startTime ||
            null,
          berakhir:
            req.body?.jamBerakhir ||
            req.body?.endHour ||
            req.body?.endTime ||
            null,
        },
        jumlahTempatWisata:
          req.body?.jumlahTempatWisata || req.body?.maxDestinations || null,
        butuhMakanSiang:
          req.body?.butuhMakanSiang ??
          req.body?.needLunchStop ??
          req.body?.includeLunchStop ??
          null,
        butuhAkomodasi:
          req.body?.butuhAkomodasi ??
          req.body?.needAccommodation ??
          req.body?.includeAccommodation ??
          null,
      },
      ringkasanGenerator: {
        activeHoursRule: data?.summary?.activeHoursRule || null,
        destinationLimit: data?.summary?.destinationLimit ?? null,
        appliedPreferences: data?.summary?.appliedPreferences || [],
        lunchStopRequested: data?.summary?.lunchStopRequested ?? false,
        accommodationRequested: data?.summary?.accommodationRequested ?? false,
      },
      data: itinerarySederhana,
    });
  } catch (error) {
    const isInputError =
      /wajib|valid|harus|minimal|format|angka|koordinat/i.test(error.message);

    res.status(isInputError ? 400 : 500).json({
      message: "Gagal membuat rekomendasi itinerary sederhana",
      error: error.message,
    });
  }
}

async function getItineraryRecommendationCompact(req, res) {
  try {
    const data = await itineraryPlannerService.buildItineraryRecommendation(
      req.body,
    );

    const compact = {
      generatedAt: new Date().toISOString(),
      summary: data.summary || {},
      route: data.route || {},
      itineraryByDay: Array.isArray(data.itineraryByDay)
        ? data.itineraryByDay.map((dayPlan, dayIndex) => ({
            dayIndex,
            date: dayPlan?.date || null,
            visits: Array.isArray(dayPlan?.visits)
              ? dayPlan.visits.map((visit, visitIndex) => ({
                  dayIndex,
                  visitIndex,
                  stopId:
                    visit?.stopId || visit?.id || visit?.destinationId || null,
                  destinationId:
                    visit?.destinationId ||
                    visit?.id ||
                    visit?.wisataId ||
                    null,
                  sourceType:
                    visit?.sourceType || visit?.tipeStop || "objek_wisata",
                  visitStart: visit?.schedule?.visitStartTime || null,
                  visitEnd: visit?.schedule?.visitEndTime || null,
                  estimatedVisitDurationMinutes:
                    visit?.estimatedVisitDurationMinutes ||
                    visit?.finalVisitDurationMinutes ||
                    null,
                  finalVisitDurationMinutes:
                    visit?.finalVisitDurationMinutes || null,
                  duration: visit?.duration || visit?.durasi || null,
                  location:
                    visit?.location ||
                    (visit?.lat && visit?.lon
                      ? { latitude: visit.lat, longitude: visit.lon }
                      : null),
                  travel: {
                    distanceKm:
                      visit?.travel?.distanceKm ?? visit?.distance ?? null,
                    estimatedTravelMinutes:
                      visit?.travel?.estimatedTravelMinutes ??
                      visit?.travel?.estimatedTravelSlotMinutes ??
                      visit?.travelMinutes ??
                      null,
                  },
                  isLunchStop: Boolean(visit?.isLunchStop),
                  isAccommodationStop: Boolean(visit?.isAccommodationStop),
                  category: visit?.category || null,
                  categories: Array.isArray(visit?.categories)
                    ? visit.categories
                    : [],
                  operatingHours: visit?.operatingHours || null,
                }))
              : [],
          }))
        : [],
    };

    res.status(200).json({
      message: "Rekomendasi compact berhasil dibuat (cocok untuk save/replace)",
      data: compact,
    });
  } catch (error) {
    const isInputError =
      /wajib|valid|harus|minimal|format|angka|koordinat|draft/i.test(
        error.message,
      );

    res.status(isInputError ? 400 : 500).json({
      message: "Gagal membuat rekomendasi compact",
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

async function getWisataForUserMinatByCategory(req, res) {
  try {
    const profile = await authService.getUserProfileById(req.user.id);

    let categoryIds = [];
    if (Array.isArray(profile.minat_kategori))
      categoryIds = profile.minat_kategori;
    else if (typeof profile.minat_kategori === "string")
      categoryIds = profile.minat_kategori
        .split(/[,/|;]/)
        .map((s) => s.trim())
        .filter(Boolean);

    const data = await userWisataService.getWisataByCategoryIds(categoryIds);

    const simplified = (data.wisata || []).map((w) => ({
      id: w.id,
      nama: w.name || null,
      deskripsi: w.description || null,
      kategori: w.category || null,
      gambar: w.imageUrl || w.image_url || null,
    }));

    res.status(200).json({
      message: "Wisata sesuai minat user (kategori IDs) berhasil diambil",
      total: data.total,
      minatKategori: data.preferences,
      data: simplified,
    });
  } catch (error) {
    res.status(500).json({
      message: "Gagal mengambil wisata sesuai minat user (kategori IDs)",
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
    const selectFields = [
      "id",
      "nama_objek_wisata",
      "deskripsi",
      "lokasi",
      "latitude",
      "longitude",
      "is_buka",
      "tiket_masuk",
      "jam_operasional",
      "fasilitas",
      "url_foto",
    ];

    const { data, error } = await supabase
      .from("objek_wisata")
      .select(selectFields.join(","))
      .in("id", ids);

    if (error) throw error;

    const normalizedData = (data || []).map(normalizePublicWisataRow);
    const responseData = normalizedData.map((item) =>
      pickRequestedFields(item, fieldsRaw),
    );

    res.status(200).json({
      message: "Detail objek wisata (batch) berhasil diambil",
      total: responseData.length,
      data: responseData,
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

async function getTempatMakanBatch(req, res) {
  try {
    const idsRaw = String(req.query.ids || "").trim();
    if (!idsRaw) {
      throw new Error("Query param 'ids' wajib diisi (contoh: ids=1,2,3)");
    }

    const ids = idsRaw
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map((value) => (Number.isNaN(Number(value)) ? value : Number(value)));

    if (ids.length === 0) {
      throw new Error("Query param 'ids' tidak berisi id yang valid");
    }

    if (ids.length > 200) {
      throw new Error("Too many ids; max 200 allowed per request");
    }

    const selectFields = buildBatchSelectFields(
      req.query.fields,
      [
        "id",
        "nama",
        "alamat",
        "latitude",
        "longitude",
        "rating",
        "url_gambar",
        "kategori",
      ],
      [
        "id",
        "nama",
        "alamat",
        "latitude",
        "longitude",
        "rating",
        "url_gambar",
        "kategori",
      ],
    );

    const { data, error } = await supabase
      .from("tempat_makan")
      .select(selectFields.join(","))
      .in("id", ids);

    if (error) throw error;

    const normalizedData = (data || []).map(normalizePublicTempatMakanRow);
    const responseData = normalizedData.map((item) =>
      pickRequestedFields(item, String(req.query.fields || "").trim()),
    );

    res.status(200).json({
      message: "Detail tempat makan (batch) berhasil diambil",
      total: responseData.length,
      data: responseData,
    });
  } catch (error) {
    const isInputError = /wajib|valid|Too many ids|id yang valid/i.test(
      error.message,
    );

    res.status(isInputError ? 400 : 500).json({
      message: "Gagal mengambil tempat makan (batch)",
      error: error.message,
    });
  }
}

async function getAkomodasiBatch(req, res) {
  try {
    const idsRaw = String(req.query.ids || "").trim();
    if (!idsRaw) {
      throw new Error("Query param 'ids' wajib diisi (contoh: ids=1,2,3)");
    }

    const ids = idsRaw
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map((value) => (Number.isNaN(Number(value)) ? value : Number(value)));

    if (ids.length === 0) {
      throw new Error("Query param 'ids' tidak berisi id yang valid");
    }

    if (ids.length > 200) {
      throw new Error("Too many ids; max 200 allowed per request");
    }

    const selectFields = buildBatchSelectFields(
      req.query.fields,
      [
        "id",
        "nama",
        "alamat",
        "nomor_telepon",
        "latitude",
        "longitude",
        "rating",
        "url_gambar",
        "kategori",
      ],
      [
        "id",
        "nama",
        "alamat",
        "nomor_telepon",
        "latitude",
        "longitude",
        "rating",
        "url_gambar",
        "kategori",
      ],
    );

    const { data, error } = await supabase
      .from("akomodasi")
      .select(selectFields.join(","))
      .in("id", ids);

    if (error) throw error;

    const normalizedData = (data || []).map(normalizePublicAkomodasiRow);
    const responseData = normalizedData.map((item) =>
      pickRequestedFields(item, String(req.query.fields || "").trim()),
    );

    res.status(200).json({
      message: "Detail akomodasi (batch) berhasil diambil",
      total: responseData.length,
      data: responseData,
    });
  } catch (error) {
    const isInputError = /wajib|valid|Too many ids|id yang valid/i.test(
      error.message,
    );

    res.status(isInputError ? 400 : 500).json({
      message: "Gagal mengambil akomodasi (batch)",
      error: error.message,
    });
  }
}

async function getObjekWisataByIdPublic(req, res) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      throw new Error("ID wisata harus berupa angka positif");
    }

    const { data, error } = await supabase
      .from("objek_wisata")
      .select(
        [
          "id",
          "nama_objek_wisata",
          "deskripsi",
          "lokasi",
          "latitude",
          "longitude",
          "is_buka",
          "tiket_masuk",
          "jam_operasional",
          "fasilitas",
          "url_foto",
        ].join(","),
      )
      .eq("id", id)
      .single();

    if (error) throw error;

    res.status(200).json({
      message: "Detail objek wisata berhasil diambil",
      data: normalizePublicWisataRow(data),
    });
  } catch (error) {
    const isInputError = /id|angka/i.test(error.message);
    const isNotFound = /no rows/i.test(error.message);

    res.status(isInputError ? 400 : isNotFound ? 404 : 500).json({
      message: "Gagal mengambil detail objek wisata",
      error: isNotFound ? "Objek wisata tidak ditemukan" : error.message,
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

    // Buat summary dari itinerary (prioritas: summary, lalu travelMetrics)
    const summary = req.body.itinerary.summary ||
      req.body.itinerary.travelMetrics || {
        totalDays: req.body.durasi_hari,
        totalDistance: 0,
        totalWisataStops: visitList.filter((v) => v.visitType === "wisata")
          .length,
        avgDistancePerDay: 0,
      };

    // Simpan versi lengkap itinerary agar detail bisa langsung dipakai dari DB
    // tanpa perlu enrich/fetch tambahan berdasarkan id destinasi.
    const generatedAt =
      req.body.itinerary.generatedAt || new Date().toISOString();

    // Data yang akan disimpan: full itinerary + snapshot visitList
    const data_itinerary = {
      ...req.body.itinerary,
      visitList,
      summary,
      generatedAt,
    };

    // Guard: pastikan key utama tetap tersedia untuk fitur lama
    if (!Array.isArray(data_itinerary.itineraryByDay)) {
      data_itinerary.itineraryByDay = req.body.itinerary.itineraryByDay || [];
    }

    if (!Array.isArray(data_itinerary.recommendedDestinations)) {
      data_itinerary.recommendedDestinations =
        req.body.itinerary.recommendedDestinations || [];
    }

    if (!Array.isArray(data_itinerary.simpleItinerary)) {
      data_itinerary.simpleItinerary = req.body.itinerary.simpleItinerary || [];
    }

    if (
      !data_itinerary.travelMetrics ||
      typeof data_itinerary.travelMetrics !== "object"
    ) {
      data_itinerary.travelMetrics =
        req.body.itinerary.travelMetrics || summary;
    }

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

async function deleteRencanaPerjalanan(req, res) {
  try {
    const rencanaUserId = await resolveRencanaUserId(req.user);
    const rencanaId = String(req.params.id || "").trim();

    if (!rencanaId) {
      throw new Error("id rencana perjalanan wajib diisi");
    }

    const data = await rencanaPerjalananService.hapusRencanaPerjalanan({
      rencanaId,
      userId: rencanaUserId,
    });

    res.status(200).json({
      message: "Rencana perjalanan berhasil dihapus",
      data: { id: data.id },
    });
  } catch (error) {
    const isInputError = /wajib|tidak ditemukan|id/i.test(error.message);

    res.status(isInputError ? 400 : 500).json({
      message: "Gagal menghapus rencana perjalanan",
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

    // 1. KUNCI UTAMA: Gunakan stopInstanceId (fallback ke visitOrder jika di aplikasi lama)
    const stopInstanceId = String(
      req.body.stopInstanceId ?? req.body.visitOrder ?? req.body.order,
    ).trim();

    const destinationIdRaw =
      req.body.destinationId ?? req.body.stopId ?? req.body.wisataId;
    const action = String(req.body.action ?? "complete")
      .trim()
      .toLowerCase();

    // 2. Validasi Input yang lebih ketat
    if (!rencanaId) throw new Error("id rencana perjalanan wajib diisi");
    if (!stopInstanceId || stopInstanceId === "undefined") {
      throw new Error(
        "stopInstanceId wajib diisi untuk melacak kunjungan secara unik",
      );
    }

    // 3. Ambil rencana perjalanan dari database
    const rencana = await rencanaPerjalananService.getRencanaPerjalananById({
      rencanaId,
      userId: rencanaUserId,
    });

    const visitList = Array.isArray(rencana?.data_itinerary?.visitList)
      ? rencana.data_itinerary.visitList
      : [];

    // PENCOCOKAN KONSISTEN: Cari di visitList berdasarkan stopInstanceId
    const matchedVisit = visitList.find(
      (item) =>
        String(item.stopInstanceId) === stopInstanceId ||
        String(item.visitOrder) === stopInstanceId,
    );

    const resolvedDestinationId =
      destinationIdRaw ??
      matchedVisit?.wisataId ??
      matchedVisit?.destinationId ??
      null;
    const resolvedVisitOrder = Number.isFinite(Number(stopInstanceId))
      ? Number(stopInstanceId)
      : (matchedVisit?.visitOrder ?? null);

    const updateTimestamp = new Date().toISOString();

    // 4. Ambil array progress saat ini
    let progressArray = [];
    if (Array.isArray(rencana?.progres_kunjungan?.destinationProgress)) {
      progressArray = [...rencana.progres_kunjungan.destinationProgress];
    }

    // 5. Cari index progres berdasarkan stopInstanceId (SANGAT AKURAT)
    const existingIndex = progressArray.findIndex(
      (item) =>
        String(item.stopInstanceId) === stopInstanceId ||
        String(item.visitOrder) === stopInstanceId,
    );

    // 6. Logika Update State
    if (action === "complete") {
      if (existingIndex >= 0) {
        progressArray[existingIndex].status = "completed";
        progressArray[existingIndex].completedAt = updateTimestamp;
        progressArray[existingIndex].stopInstanceId = stopInstanceId; // Kunci permanen

        if (resolvedDestinationId) {
          progressArray[existingIndex].destinationId = resolvedDestinationId;
        }
      } else {
        progressArray.push({
          stopInstanceId,
          visitOrder: resolvedVisitOrder,
          destinationId: resolvedDestinationId,
          status: "completed",
          completedAt: updateTimestamp,
        });
      }
    } else if (action === "undo" && existingIndex >= 0) {
      progressArray.splice(existingIndex, 1);
    }

    // 7. Susun JSON yang jauh lebih ringan (Tanpa perlu looping byDay)
    const progresKunjungan = {
      updatedAt: updateTimestamp,
      totalCompleted: progressArray.length,
      destinationProgress: progressArray,
    };

    // 8. Simpan ke database
    const updated = await rencanaPerjalananService.updateProgresKunjungan({
      rencanaId,
      userId: rencanaUserId,
      progresKunjungan,
    });

    res.status(200).json({
      message:
        action === "undo"
          ? "Progres destinasi berhasil dibatalkan"
          : "Progres destinasi berhasil diupdate",
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
  getItineraryRecommendationSimple,
  getItineraryRecommendationCompact,
  getItineraryEnrichment,
  getNearestDestinationsDebug,
  getNearestDestinationsOnlyDebug,
  getNearestDestinationsOnlyDebugByCategory,
  getAvailableWisataCategories,
  getWisataForUserMinat,
  getWisataForUserMinatByCategory,
  getCuratedWisataForUser,
  previewItineraryReplacement,
  confirmItineraryReplacement,
  saveRencanaPerjalanan,
  getRencanaPerjalananUser,
  getRencanaPerjalananById,
  deleteRencanaPerjalanan,
  updateRencanaPerjalananProgress,
  getObjekWisataBatch,
  getTempatMakanBatch,
  getAkomodasiBatch,
  getObjekWisataByIdPublic,
};
