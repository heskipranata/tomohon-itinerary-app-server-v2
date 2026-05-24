const supabase = require("../config/supabase");

const tables = {
  wisata: "objek_wisata",
  kategori: "kategori_wisata",
  tempat_makan: "tempat_makan",
  akomodasi: "akomodasi",
};

async function getCounts() {
  try {
    const promises = Object.entries(tables).map(async ([key, table]) => {
      const { count, error } = await supabase
        .from(table)
        .select("*", { count: "exact", head: true });

      if (error) throw error;

      return { [key]: count || 0 };
    });

    const rows = await Promise.all(promises);
    return rows.reduce((acc, cur) => ({ ...acc, ...cur }), {});
  } catch (error) {
    throw error;
  }
}

module.exports = { getCounts };
