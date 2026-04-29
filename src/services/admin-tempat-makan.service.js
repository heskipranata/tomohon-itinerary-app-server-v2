const supabase = require("../config/supabase");

const tempatMakanTable = "tempat_makan";
const tempatMakanColumns =
  "id,nama,kategori,alamat,rating,latitude,longitude,url_gambar";

async function getAllTempatMakanForAdmin() {
  const { data, error } = await supabase
    .from(tempatMakanTable)
    .select(tempatMakanColumns)
    .order("id", { ascending: true });

  if (error) throw error;
  return data;
}

async function getTempatMakanByIdForAdmin(id) {
  const { data, error } = await supabase
    .from(tempatMakanTable)
    .select(tempatMakanColumns)
    .eq("id", id)
    .single();

  if (error) throw error;
  return data;
}

async function createTempatMakanForAdmin(payload) {
  const { data, error } = await supabase
    .from(tempatMakanTable)
    .insert(payload)
    .select(tempatMakanColumns)
    .single();

  if (error) throw error;
  return data;
}

async function updateTempatMakanForAdmin(id, payload) {
  const { data, error } = await supabase
    .from(tempatMakanTable)
    .update(payload)
    .eq("id", id)
    .select(tempatMakanColumns)
    .single();

  if (error) throw error;
  return data;
}

async function deleteTempatMakanForAdmin(id) {
  const { error } = await supabase.from(tempatMakanTable).delete().eq("id", id);

  if (error) throw error;

  return { id };
}

module.exports = {
  getAllTempatMakanForAdmin,
  getTempatMakanByIdForAdmin,
  createTempatMakanForAdmin,
  updateTempatMakanForAdmin,
  deleteTempatMakanForAdmin,
};
