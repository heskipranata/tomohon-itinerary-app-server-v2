function buildWisataDataAccess({ supabase, normalizeCategoryTokens }) {
  const wisataTable = "objek_wisata";
  const kategoriTable = "kategori_wisata";
  const akomodasiTable = "akomodasi";
  const akomodasiFallbackTables = ["hotel", "tempat_menginap"];

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

  async function getAllWisata() {
    const { data, error } = await supabase.from(wisataTable).select("*");
    if (error) throw error;
    return data;
  }

  async function getAllTempatMakan() {
    const { data, error } = await supabase.from("tempat_makan").select("*");
    if (error) throw error;
    return data;
  }

  async function getAllAkomodasi() {
    const candidateTables = [akomodasiTable, ...akomodasiFallbackTables];
    let lastError = null;

    for (const tableName of candidateTables) {
      const { data, error } = await supabase.from(tableName).select("*");
      if (!error) {
        return { rows: data || [], sourceTable: tableName };
      }
      lastError = error;
    }

    throw lastError || new Error("Gagal mengambil data akomodasi");
  }

  // BUILD UNIQUE CATEGORY LIST DARI SEMUA TABEL
  async function getAvailableWisataCategories() {
    // Ambil semua data sekalian
    const [wisataData, kategoriData, tempatMakanData, akomodasiData] = await Promise.all([
      getAllWisata(),
      supabase.from(kategoriTable).select("nama"),
      getAllTempatMakan().catch(() => []), // Catch jika tabel belum ada agar tidak error
      getAllAkomodasi().catch(() => ({ rows: [] }))
    ]);

    const kategoriRows = kategoriData?.data || [];
    const tempatMakanRows = Array.isArray(tempatMakanData) ? tempatMakanData : [];
    const akomodasiRows = akomodasiData.rows || [];

    const categories = [
      ...new Set(
        [
          ...kategoriRows.map((item) => normalizeCategoryTokens(item.nama)).flat(),
          ...wisataData,
          ...tempatMakanRows,
          ...akomodasiRows,
        ]
          .flatMap((item) => {
            if (typeof item === "string") {
              return normalizeCategoryTokens(item);
            }

            const categoryValue = getFirstAvailableValue(item, [
              "kategori",
              "category",
              "jenis_wisata",
            ]);

            if (!categoryValue) return [];
            return normalizeCategoryTokens(categoryValue);
          })
          .filter((item) => item.length > 0),
      ),
    ].sort((a, b) => a.localeCompare(b));

    return categories;
  }

  return {
    getAllWisata,
    getAllTempatMakan,
    getAllAkomodasi,
    getAvailableWisataCategories,
  };
}

module.exports = {
  buildWisataDataAccess,
};