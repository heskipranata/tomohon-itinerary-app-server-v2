const supabase = require("../config/supabase");
const {
  normalizeCategoryTokens,
  categoryMatchesPreference,
} = require("./wisata/category-utils");
const { buildWisataDataAccess } = require("./wisata/data-access");

const { getAllWisata } = buildWisataDataAccess({
  supabase,
  normalizeCategoryTokens,
});

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

function parseBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "ya", "yes", "open", "buka"].includes(normalized)) {
      return true;
    }
    if (["false", "0", "tidak", "no", "closed", "tutup"].includes(normalized)) {
      return false;
    }
  }
  return null;
}

function isWisataActive(raw) {
  const isOpenRaw = getFirstAvailableValue(raw, [
    "isOpen",
    "is_open",
    "is_buka",
    "open",
  ]);
  const parsed = parseBoolean(isOpenRaw);

  if (parsed === null) {
    return true;
  }

  return parsed;
}

function mapWisataRecommendation(raw) {
  const categoryValue = getFirstAvailableValue(raw, [
    "kategori",
    "category",
    "jenis_wisata",
  ]);
  const categoryTokens = normalizeCategoryTokens(categoryValue);
  const categoryLabel = categoryTokens.join(", ") || categoryValue || null;

  return {
    id: raw.id,
    name: getFirstAvailableValue(raw, [
      "nama_objek_wisata",
      "nama",
      "name",
      "nama_destinasi",
    ]),
    description: getFirstAvailableValue(raw, ["deskripsi", "description"]),
    imageUrl: getFirstAvailableValue(raw, [
      "url_foto",
      "image_url",
      "image",
      "foto",
    ]),
    locationLabel: getFirstAvailableValue(raw, ["lokasi", "alamat", "address"]),
    category: categoryTokens[0] || categoryValue,
    categoryLabel,
    categories: categoryTokens,
    categoryTokens,
    isOpen: isWisataActive(raw),
    facilities: normalizeCategoryTokens(
      getFirstAvailableValue(raw, ["fasilitas", "facilities", "facility"]),
    ),
    latitude: getFirstAvailableValue(raw, ["latitude", "lat"]),
    longitude: getFirstAvailableValue(raw, ["longitude", "lng", "lon"]),
    lat: getFirstAvailableValue(raw, ["latitude", "lat"]),
    lon: getFirstAvailableValue(raw, ["longitude", "lng", "lon"]),
    raw,
  };
}

function normalizePreferenceList(minatKategori) {
  if (Array.isArray(minatKategori)) {
    return minatKategori
      .map((item) => String(item).trim().toLowerCase())
      .filter((item) => item.length > 0);
  }

  if (typeof minatKategori === "string") {
    return minatKategori
      .split(/[,/|;]/)
      .map((item) => item.trim().toLowerCase())
      .filter((item) => item.length > 0);
  }

  return [];
}

async function getWisataByPreferences(minatKategori) {
  const preferences = normalizePreferenceList(minatKategori);
  const wisataRows = await getAllWisata();

  const wisata = wisataRows
    .map(mapWisataRecommendation)
    .filter((item) => item.isOpen !== false)
    .filter((item) =>
      categoryMatchesPreference(item.categoryTokens, preferences),
    )
    .sort((a, b) => {
      const categoryComparison = String(
        a.categoryLabel || a.category || "",
      ).localeCompare(String(b.categoryLabel || b.category || ""));
      if (categoryComparison !== 0) {
        return categoryComparison;
      }

      return String(a.name || "").localeCompare(String(b.name || ""));
    });

  return {
    preferences,
    total: wisata.length,
    wisata,
  };
}

module.exports = {
  getWisataByPreferences,
};

async function getWisataByCategoryIds(categoryIds) {
  const ids = Array.isArray(categoryIds)
    ? categoryIds.map((i) => String(i).trim()).filter(Boolean)
    : [];

  if (ids.length === 0) {
    return { preferences: ids, total: 0, wisata: [] };
  }

  const wisataRows = await getAllWisata();

  const filtered = (wisataRows || []).filter((row) => {
    const kIds = Array.isArray(row.kategori_ids)
      ? row.kategori_ids.map((x) => String(x))
      : [];
    return kIds.some((k) => ids.includes(String(k))) && isWisataActive(row);
  });

  const wisata = filtered.map(mapWisataRecommendation).sort((a, b) => {
    const categoryComparison = String(
      a.categoryLabel || a.category || "",
    ).localeCompare(String(b.categoryLabel || b.category || ""));
    if (categoryComparison !== 0) return categoryComparison;
    return String(a.name || "").localeCompare(String(b.name || ""));
  });

  return { preferences: ids, total: wisata.length, wisata };
}

module.exports = {
  getWisataByPreferences,
  getWisataByCategoryIds,
};
