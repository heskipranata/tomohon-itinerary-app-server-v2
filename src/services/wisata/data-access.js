function buildWisataDataAccess({ supabase, normalizeCategoryTokens }) {
  const wisataTable = "objek_wisata";
  const kategoriTable = "kategori_wisata";
  const mappingTable = "objek_wisata_kategori";
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
    const { data: wisataRows, error: wisataError } = await supabase
      .from(wisataTable)
      .select("*");
    if (wisataError) throw wisataError;

    const ids = (wisataRows || []).map((r) => r.id).filter(Boolean);

    if (ids.length === 0) return wisataRows || [];

    const { data: mappingRows, error: mappingError } = await supabase
      .from(mappingTable)
      .select("objek_wisata_id,kategori_id")
      .in("objek_wisata_id", ids);

    if (mappingError) throw mappingError;

    const kategoriIds = Array.from(
      new Set((mappingRows || []).map((m) => m.kategori_id).filter(Boolean)),
    );

    const { data: kategoriRows, error: kategoriError } = kategoriIds.length
      ? await supabase
          .from(kategoriTable)
          .select("id,nama")
          .in("id", kategoriIds)
      : { data: [], error: null };

    if (kategoriError) throw kategoriError;

    const kategoriById = (kategoriRows || []).reduce((acc, k) => {
      acc[k.id] = k.nama;
      return acc;
    }, {});

    const mappingsByWisata = (mappingRows || []).reduce((acc, m) => {
      acc[m.objek_wisata_id] = acc[m.objek_wisata_id] || [];
      acc[m.objek_wisata_id].push(m.kategori_id);
      return acc;
    }, {});

    return (wisataRows || []).map((row) => {
      const kIds = mappingsByWisata[row.id] || [];
      const kNames = kIds.map((id) => kategoriById[id]).filter(Boolean);
      return {
        ...row,
        kategori_ids: kIds,
        kategori: kNames.join(", ") || row.kategori || null,
      };
    });
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
    const [wisataData, kategoriData, tempatMakanData, akomodasiData] =
      await Promise.all([
        getAllWisata(),
        supabase.from(kategoriTable).select("nama"),
        getAllTempatMakan().catch(() => []), // Catch jika tabel belum ada agar tidak error
        getAllAkomodasi().catch(() => ({ rows: [] })),
      ]);

    const kategoriRows = kategoriData?.data || [];
    const tempatMakanRows = Array.isArray(tempatMakanData)
      ? tempatMakanData
      : [];
    const akomodasiRows = akomodasiData.rows || [];

    const categories = [
      ...new Set(
        [
          ...kategoriRows
            .map((item) => normalizeCategoryTokens(item.nama))
            .flat(),
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
