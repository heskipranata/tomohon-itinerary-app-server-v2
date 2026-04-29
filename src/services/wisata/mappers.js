function buildWisataMappers({
  normalizeCategoryTokens,
  normalizeOperatingHoursText,
  parseOperatingHours,
  roundUpToTimeSlot,
  resolveMinimumVisitDurationMinutes,
  lunchSourceType = "tempat_makan",
  defaultLunchVisitDurationMinutes = 90,
  minLunchVisitDurationMinutes = 45,
  maxLunchVisitDurationMinutes = 120,
  defaultAccommodationVisitDurationMinutes = 60,
}) {
  function parseNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function parseBoolean(value) {
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value !== 0;
    if (typeof value !== "string") return null;

    const normalized = value.trim().toLowerCase();

    if (["true", "1", "ya", "yes", "open", "buka"].includes(normalized)) {
      return true;
    }

    if (["false", "0", "tidak", "no", "closed", "tutup"].includes(normalized)) {
      return false;
    }

    return null;
  }

  function getFirstAvailableValue(source, keys) {
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

  function normalizeTextListTokens(value) {
    if (!value) return [];
    return String(value)
      .toLowerCase()
      .split(/[,/|;]/)
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }

  function mapDestination(raw) {
    const latitude = parseNumber(getFirstAvailableValue(raw, ["latitude", "lat"]));
    const longitude = parseNumber(getFirstAvailableValue(raw, ["longitude", "lng", "lon"]));
    const visitDurationMinutes = parseNumber(
      getFirstAvailableValue(raw, ["estimasi_kunjungan", "durasi_kunjungan", "visit_duration_minutes", "durasi", "duration"])
    );
    const category = getFirstAvailableValue(raw, ["kategori", "category", "jenis_wisata"]);
    const name = getFirstAvailableValue(raw, ["nama_objek_wisata", "nama", "name", "nama_destinasi"]);
    const description = getFirstAvailableValue(raw, ["deskripsi", "description"]);
    const ticketPrice = parseNumber(getFirstAvailableValue(raw, ["tiket_masuk", "ticket_price", "price"]));
    const imageUrl = getFirstAvailableValue(raw, ["url_foto", "image_url", "image", "foto"]);
    const locationLabel = getFirstAvailableValue(raw, ["lokasi", "alamat", "address"]);
    const operatingHoursRaw = getFirstAvailableValue(raw, ["jam_operasional", "operating_hours", "opening_hours"]);
    const facilitiesRaw = getFirstAvailableValue(raw, ["fasilitas", "facilities", "facility"]);
    const isOpenRaw = getFirstAvailableValue(raw, ["is_buka", "is_open", "open"]);
    
    const isOpen = parseBoolean(isOpenRaw);
    const categoryTokens = normalizeCategoryTokens(category);
    const facilityTokens = normalizeTextListTokens(facilitiesRaw);
    const parsedOperatingHours = parseOperatingHours(operatingHoursRaw);
    const normalizedOperatingHours = normalizeOperatingHoursText(operatingHoursRaw, parsedOperatingHours);

    return {
      id: raw.id,
      name,
      description,
      ticketPrice,
      imageUrl,
      locationLabel,
      category: categoryTokens[0] || category,
      categoryTokens,
      facilities: facilityTokens,
      latitude,
      longitude,
      visitDurationMinutes,
      operatingHours: parsedOperatingHours,
      operatingHoursRaw,
      operatingHoursText: normalizedOperatingHours,
      isOpen: isOpen === null ? true : isOpen,
      raw,
    };
  }

  function mapTempatMakan(raw) {
    const latitude = parseNumber(getFirstAvailableValue(raw, ["latitude", "lat"]));
    const longitude = parseNumber(getFirstAvailableValue(raw, ["longitude", "lng", "lon"]));
    const name = getFirstAvailableValue(raw, ["nama", "name"]);
    const category = getFirstAvailableValue(raw, ["kategori", "category"]);
    const imageUrl = getFirstAvailableValue(raw, ["url_gambar", "image_url", "image", "foto"]);
    const locationLabel = getFirstAvailableValue(raw, ["alamat", "lokasi", "address"]);
    const rating = parseNumber(getFirstAvailableValue(raw, ["rating", "rate", "stars"]));
    const isOpenRaw = getFirstAvailableValue(raw, ["is_buka", "is_open", "open"]);
    
    const categoryTokens = normalizeCategoryTokens(category || "tempat makan, restoran");
    const isOpen = parseBoolean(isOpenRaw);

    // MOCK WAKTU: Menghindari bug restoran terbaca 24 jam
    const mockOperatingHoursText = "10:00 - 22:00";
    const parsedOperatingHours = parseOperatingHours(mockOperatingHoursText);

    return {
      id: `tempat-makan-${raw.id}`,
      name,
      description: null,
      ticketPrice: null,
      rating,
      phoneNumber: null,
      imageUrl,
      locationLabel,
      category: categoryTokens[0] || "tempat makan",
      categoryTokens,
      facilities: ["makan", "kuliner"],
      latitude,
      longitude,
      visitDurationMinutes: defaultLunchVisitDurationMinutes,
      operatingHours: parsedOperatingHours,
      operatingHoursRaw: mockOperatingHoursText,
      operatingHoursText: mockOperatingHoursText,
      isOpen: isOpen === null ? true : isOpen,
      sourceType: lunchSourceType,
      raw,
    };
  }

  function mapLunchCandidatesFromTempatMakan(rows) {
    return rows
      .map(mapTempatMakan)
      .filter((item) => item.latitude !== null && item.longitude !== null)
      .map((item) => {
        const normalizedDuration = roundUpToTimeSlot(
          Math.min(
            maxLunchVisitDurationMinutes,
            Math.max(
              minLunchVisitDurationMinutes,
              item.visitDurationMinutes || defaultLunchVisitDurationMinutes,
            ),
          ),
        );

        return {
          ...item,
          finalVisitDurationMinutes: normalizedDuration,
          minVisitDurationMinutes: resolveMinimumVisitDurationMinutes(normalizedDuration),
          visitDurationSource: "default-tempat_makan",
        };
      });
  }

  function mapAkomodasi(raw, sourceTable) {
    const latitude = parseNumber(getFirstAvailableValue(raw, ["latitude", "lat"]));
    const longitude = parseNumber(getFirstAvailableValue(raw, ["longitude", "lng", "lon"]));
    const name = getFirstAvailableValue(raw, ["nama", "name"]);
    const category = getFirstAvailableValue(raw, ["kategori", "category"]);
    const description = getFirstAvailableValue(raw, ["deskripsi", "description"]);
    const imageUrl = getFirstAvailableValue(raw, ["url_gambar", "url_foto", "image_url", "image", "foto"]);
    const locationLabel = getFirstAvailableValue(raw, ["alamat", "lokasi", "address"]);
    const rating = parseNumber(getFirstAvailableValue(raw, ["rating", "rate", "stars"]));
    const phoneNumber = getFirstAvailableValue(raw, ["nomor_telepon", "phone_number", "phone", "telp", "no_telp"]);
    const isOpenRaw = getFirstAvailableValue(raw, ["is_buka", "is_open", "open"]);
    const operatingHoursRaw = getFirstAvailableValue(raw, ["jam_operasional", "operating_hours"]);
    
    const categoryTokens = normalizeCategoryTokens(category || "akomodasi, hotel");
    const isOpen = parseBoolean(isOpenRaw);
    const parsedOperatingHours = parseOperatingHours(operatingHoursRaw);
    const normalizedOperatingHours = normalizeOperatingHoursText(operatingHoursRaw, parsedOperatingHours);

    return {
      id: `${sourceTable}-${raw.id}`,
      name,
      description,
      ticketPrice: null,
      rating,
      phoneNumber,
      imageUrl,
      locationLabel,
      category: categoryTokens[0] || "akomodasi",
      categoryTokens,
      facilities: ["akomodasi", "menginap"],
      latitude,
      longitude,
      visitDurationMinutes: defaultAccommodationVisitDurationMinutes,
      operatingHours: parsedOperatingHours,
      operatingHoursRaw: operatingHoursRaw,
      operatingHoursText: normalizedOperatingHours || "24 jam",
      isOpen: isOpen === null ? true : isOpen,
      sourceType: sourceTable,
      raw,
    };
  }

  function mapAccommodationCandidatesFromRows(rows, sourceTable) {
    return rows
      .map((item) => mapAkomodasi(item, sourceTable))
      .filter((item) => item.latitude !== null && item.longitude !== null)
      .map((item) => ({
        ...item,
        finalVisitDurationMinutes: roundUpToTimeSlot(defaultAccommodationVisitDurationMinutes),
        minVisitDurationMinutes: roundUpToTimeSlot(defaultAccommodationVisitDurationMinutes),
        visitDurationSource: "default-akomodasi",
      }));
  }

  return {
    mapDestination,
    mapTempatMakan,
    mapLunchCandidatesFromTempatMakan,
    mapAkomodasi,
    mapAccommodationCandidatesFromRows,
  };
}

module.exports = {
  buildWisataMappers,
};