const supabase = require("../config/supabase");

const wisataTable = "objek_wisata";

async function getAllWisataForAdmin() {
  const { data, error } = await supabase
    .from(wisataTable)
    .select("*")
    .order("id", { ascending: true });

  if (error) throw error;
  return data;
}

async function getWisataByIdForAdmin(id) {
  const { data, error } = await supabase
    .from(wisataTable)
    .select("*")
    .eq("id", id)
    .single();

  if (error) throw error;
  return data;
}

async function createWisataForAdmin(payload) {
  const { data, error } = await supabase
    .from(wisataTable)
    .insert(payload)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

async function updateWisataForAdmin(id, payload) {
  const { data, error } = await supabase
    .from(wisataTable)
    .update(payload)
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

async function deleteWisataForAdmin(id) {
  const { error } = await supabase.from(wisataTable).delete().eq("id", id);

  if (error) throw error;

  return { id };
}

module.exports = {
  getAllWisataForAdmin,
  getWisataByIdForAdmin,
  createWisataForAdmin,
  updateWisataForAdmin,
  deleteWisataForAdmin,
};
