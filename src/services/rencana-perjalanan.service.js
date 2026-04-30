const supabase = require("../config/supabase");

/**
 * Service untuk menyimpan rencana perjalanan yang sudah dikonfirmasi user ke tabel rencana_perjalanan.
 * @param {Object} params
 * @param {string} params.userId - UUID user
 * @param {Object} params.itinerary - Data itinerary lengkap (hasil konfirmasi)
 * @param {string} params.judul_trip - Judul trip
 * @param {string} params.tanggal_mulai - Tanggal mulai (YYYY-MM-DD)
 * @param {number} params.durasi_hari - Durasi hari
 * @returns {Promise<Object>} hasil insert
 */
async function simpanRencanaPerjalanan({
  userId,
  itinerary,
  judul_trip,
  tanggal_mulai,
  durasi_hari,
}) {
  if (!userId || !itinerary || !judul_trip || !tanggal_mulai || !durasi_hari) {
    throw new Error("Semua parameter wajib diisi");
  }

  const insertPayload = {
    user_id: userId,
    judul_trip,
    tanggal_mulai,
    durasi_hari,
    data_itinerary: itinerary,
    progres_kunjungan: {},
    version: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("rencana_perjalanan")
    .insert([insertPayload])
    .select()
    .single();

  if (error) throw error;
  return data;
}

module.exports = {
  simpanRencanaPerjalanan,
};
