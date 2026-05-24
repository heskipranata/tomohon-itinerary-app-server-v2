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

function mapWisataRecommendation(raw) {
  const categoryValue = getFirstAvailableValue(raw, [
    "kategori",
    "category",
    "jenis_wisata",
  ]);
  const categoryTokens = normalizeCategoryTokens(categoryValue);

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
    categoryTokens,
    facilities: normalizeCategoryTokens(
      getFirstAvailableValue(raw, ["fasilitas", "facilities", "facility"]),
    ),
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
    .filter((item) =>
      categoryMatchesPreference(item.categoryTokens, preferences),
    )
    .sort((a, b) => {
      const categoryComparison = a.category.localeCompare(b.category);
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
