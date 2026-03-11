const supabase = require("../config/supabase");

const wisataTable = "objek_wisata";

async function getAllWisata() {

  const { data, error } = await supabase
    .from(wisataTable)
    .select("*");

  if (error) throw error;

  return data;
}

module.exports = {
  getAllWisata
};

