const supabase = require("../config/supabase");
const { normalizeCategoryTokens } = require("./wisata/category-utils");

const kategoriTable = "kategori_wisata";
const wisataTable = "objek_wisata";

function normalizeKategoriName(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

async function getAllKategoriForAdmin() {
  const { data, error } = await supabase
    .from(kategoriTable)
    .select("*")
    .order("nama", { ascending: true });

  if (error) throw error;
  return data;
}

async function createKategoriForAdmin(payload) {
  const nama = normalizeKategoriName(payload.nama || payload.nama_kategori);

  if (!nama) {
    throw new Error("nama kategori wajib diisi");
  }

  const { data: existingData, error: existingError } = await supabase
    .from(kategoriTable)
    .select("id")
    .eq("nama", nama)
    .limit(1);

  if (existingError) throw existingError;

  if (existingData && existingData.length > 0) {
    throw new Error("Kategori sudah ada");
  }

  const { data, error } = await supabase
    .from(kategoriTable)
    .insert({ nama })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

async function deleteKategoriForAdmin(id) {
  const { data: kategori, error: kategoriError } = await supabase
    .from(kategoriTable)
    .select("id,nama")
    .eq("id", id)
    .single();

  if (kategoriError) throw kategoriError;

  const normalizedTarget = normalizeKategoriName(kategori.nama);

  const { data: wisataData, error: wisataError } = await supabase
    .from(wisataTable)
    .select("id,kategori");

  if (wisataError) throw wisataError;

  const isUsed = (wisataData || []).some((item) => {
    const tokens = normalizeCategoryTokens(item.kategori);
    return tokens.includes(normalizedTarget);
  });

  if (isUsed) {
    throw new Error("Kategori masih dipakai oleh data wisata");
  }

  const { error } = await supabase.from(kategoriTable).delete().eq("id", id);

  if (error) throw error;

  return { id };
}

module.exports = {
  getAllKategoriForAdmin,
  createKategoriForAdmin,
  deleteKategoriForAdmin,
};
