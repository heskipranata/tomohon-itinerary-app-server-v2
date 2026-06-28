const supabase = require("../config/supabase");
const { normalizeCategoryTokens } = require("./wisata/category-utils");

const kategoriTable = "kategori_wisata";
const wisataTable = "objek_wisata";
const mappingTable = "objek_wisata_kategori";

function normalizeKategoriName(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function replaceCategoryToken(categoryValue, oldName, newName) {
  if (!categoryValue) return categoryValue;

  if (Array.isArray(categoryValue)) {
    return categoryValue.map((item) =>
      normalizeKategoriName(item) === oldName ? newName : item,
    );
  }

  const tokens = normalizeCategoryTokens(categoryValue);

  if (tokens.length === 0) {
    return categoryValue;
  }

  const delimiters = String(categoryValue).match(/[,/|]/g) || [];
  const rebuiltTokens = tokens.map((item) =>
    item === oldName ? newName : item,
  );

  return rebuiltTokens.reduce((acc, token, index) => {
    if (index === 0) return token;
    const delimiter = delimiters[index - 1] || ",";
    return `${acc}${delimiter}${token}`;
  }, "");
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
    .insert({ nama, deskripsi: payload.deskripsi || null })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

async function updateKategoriForAdmin(id, payload) {
  const namaBaru = normalizeKategoriName(payload.nama || payload.nama_kategori);

  if (!namaBaru) {
    throw new Error("nama kategori wajib diisi");
  }

  const { data: kategoriLama, error: kategoriLamaError } = await supabase
    .from(kategoriTable)
    .select("id,nama")
    .eq("id", id)
    .single();

  if (kategoriLamaError) throw kategoriLamaError;

  // Note: we don't early return on name match anymore because deskripsi might have changed
  
  const { data: existingData, error: existingError } = await supabase
    .from(kategoriTable)
    .select("id")
    .eq("nama", namaBaru)
    .limit(1);

  if (existingError) throw existingError;

  if (existingData && existingData.length > 0 && existingData[0].id !== id) {
    throw new Error("Kategori sudah ada");
  }

  // With mapping table in place, renaming kategori only needs to update kategori_wisata.nama
  const { data, error } = await supabase
    .from(kategoriTable)
    .update({ nama: namaBaru, deskripsi: payload.deskripsi || null })
    .eq("id", id)
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
  // Check mapping table usage (objek_wisata_kategori)
  const { data: mappingUsage, error: mappingError } = await supabase
    .from(mappingTable)
    .select("id")
    .eq("kategori_id", id)
    .limit(1);

  if (mappingError) throw mappingError;

  if (mappingUsage && mappingUsage.length > 0) {
    throw new Error("Kategori masih dipakai oleh data wisata");
  }

  const { error } = await supabase.from(kategoriTable).delete().eq("id", id);

  if (error) throw error;

  return { id };
}

module.exports = {
  getAllKategoriForAdmin,
  createKategoriForAdmin,
  updateKategoriForAdmin,
  deleteKategoriForAdmin,
};
