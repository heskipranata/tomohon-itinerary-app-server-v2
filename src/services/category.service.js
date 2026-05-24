const supabase = require("../config/supabase");
const { normalizeCategoryTokens } = require("./wisata/category-utils");

const kategoriTable = "kategori_wisata";
const wisataTable = "objek_wisata";

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
    .insert({ nama })
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

  if (kategoriLama.nama === namaBaru) {
    return kategoriLama;
  }

  const { data: existingData, error: existingError } = await supabase
    .from(kategoriTable)
    .select("id")
    .eq("nama", namaBaru)
    .limit(1);

  if (existingError) throw existingError;

  if (existingData && existingData.length > 0) {
    throw new Error("Kategori sudah ada");
  }

  const { data: wisataData, error: wisataError } = await supabase
    .from(wisataTable)
    .select("id,kategori");

  if (wisataError) throw wisataError;

  const normalizedLama = normalizeKategoriName(kategoriLama.nama);
  const wisataTerkait = (wisataData || []).filter((item) => {
    const tokens = normalizeCategoryTokens(item.kategori);
    return tokens.includes(normalizedLama);
  });

  const updateWisataPromises = wisataTerkait.map((item) => {
    const kategoriBaru = replaceCategoryToken(
      item.kategori,
      normalizedLama,
      namaBaru,
    );

    return supabase
      .from(wisataTable)
      .update({ kategori: kategoriBaru })
      .eq("id", item.id);
  });

  const updateResults = await Promise.all(updateWisataPromises);
  const updateError = updateResults.find(({ error }) => error);

  if (updateError && updateError.error) {
    throw updateError.error;
  }

  const { data, error } = await supabase
    .from(kategoriTable)
    .update({ nama: namaBaru })
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
  updateKategoriForAdmin,
  deleteKategoriForAdmin,
};
