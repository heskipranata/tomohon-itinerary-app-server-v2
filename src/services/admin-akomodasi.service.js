const supabase = require("../config/supabase");

const akomodasiTable = "akomodasi";
const akomodasiColumns =
  "id,nama,kategori,alamat,nomor_telepon,rating,latitude,longitude,url_gambar";

async function getAllAkomodasiForAdmin() {
  const { data, error } = await supabase
    .from(akomodasiTable)
    .select(akomodasiColumns)
    .order("id", { ascending: true });

  if (error) throw error;
  return data;
}

async function getAkomodasiByIdForAdmin(id) {
  const { data, error } = await supabase
    .from(akomodasiTable)
    .select(akomodasiColumns)
    .eq("id", id)
    .single();

  if (error) throw error;
  return data;
}

async function createAkomodasiForAdmin(payload) {
  const { data, error } = await supabase
    .from(akomodasiTable)
    .insert(payload)
    .select(akomodasiColumns)
    .single();

  if (error) throw error;
  return data;
}

async function updateAkomodasiForAdmin(id, payload) {
  const { data, error } = await supabase
    .from(akomodasiTable)
    .update(payload)
    .eq("id", id)
    .select(akomodasiColumns)
    .single();

  if (error) throw error;
  return data;
}

async function deleteAkomodasiForAdmin(id) {
  const { error } = await supabase.from(akomodasiTable).delete().eq("id", id);

  if (error) throw error;

  return { id };
}

module.exports = {
  getAllAkomodasiForAdmin,
  getAkomodasiByIdForAdmin,
  createAkomodasiForAdmin,
  updateAkomodasiForAdmin,
  deleteAkomodasiForAdmin,
};
