const supabase = require("../config/supabase");

const wisataTable = "objek_wisata";

const mappingTable = "objek_wisata_kategori";
const kategoriTable = "kategori_wisata";

async function getAllWisataForAdmin() {
  const { data: wisataRows, error: wisataError } = await supabase
    .from(wisataTable)
    .select("*")
    .order("id", { ascending: true });

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
    ? await supabase.from(kategoriTable).select("id,nama").in("id", kategoriIds)
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

async function getWisataByIdForAdmin(id) {
  const { data: wisataRow, error: wisataError } = await supabase
    .from(wisataTable)
    .select("*")
    .eq("id", id)
    .single();

  if (wisataError) throw wisataError;

  const { data: mappingRows, error: mappingError } = await supabase
    .from(mappingTable)
    .select("kategori_id")
    .eq("objek_wisata_id", id);

  if (mappingError) throw mappingError;

  const kategoriIds = (mappingRows || [])
    .map((m) => m.kategori_id)
    .filter(Boolean);

  const { data: kategoriRows, error: kategoriError } = kategoriIds.length
    ? await supabase.from(kategoriTable).select("id,nama").in("id", kategoriIds)
    : { data: [], error: null };

  if (kategoriError) throw kategoriError;

  const kNames = (kategoriRows || []).map((k) => k.nama).filter(Boolean);

  return {
    ...wisataRow,
    kategori_ids: kategoriIds,
    kategori: kNames.join(", ") || wisataRow.kategori || null,
  };
}

async function createWisataForAdmin(payload) {
  // Accept payload.kategoriIds as array of kategori_id to insert into mapping table
  const kategoriIds = Array.isArray(payload.kategoriIds)
    ? payload.kategoriIds
        .map((v) => Number(v))
        .filter((v) => Number.isInteger(v) && v > 0)
    : null;

  const insertPayload = { ...payload };
  delete insertPayload.kategoriIds;

  const { data: created, error: createError } = await supabase
    .from(wisataTable)
    .insert(insertPayload)
    .select("*")
    .single();

  if (createError) throw createError;

  if (kategoriIds && kategoriIds.length > 0) {
    const mappingRows = kategoriIds.map((kategori_id) => ({
      objek_wisata_id: created.id,
      kategori_id,
    }));
    const { error: mapError } = await supabase
      .from(mappingTable)
      .insert(mappingRows);
    if (mapError) throw mapError;
  }

  return await getWisataByIdForAdmin(created.id);
}

async function updateWisataForAdmin(id, payload) {
  const kategoriIds = Array.isArray(payload.kategoriIds)
    ? payload.kategoriIds
        .map((v) => Number(v))
        .filter((v) => Number.isInteger(v) && v > 0)
    : null;

  const updatePayload = { ...payload };
  delete updatePayload.kategoriIds;

  const { data: updated, error: updateError } = await supabase
    .from(wisataTable)
    .update(updatePayload)
    .eq("id", id)
    .select("*")
    .single();

  if (updateError) throw updateError;

  if (kategoriIds !== null) {
    // remove existing mappings and insert new ones
    const { error: delError } = await supabase
      .from(mappingTable)
      .delete()
      .eq("objek_wisata_id", id);
    if (delError) throw delError;

    if (kategoriIds.length > 0) {
      const mappingRows = kategoriIds.map((kategori_id) => ({
        objek_wisata_id: id,
        kategori_id,
      }));
      const { error: mapError } = await supabase
        .from(mappingTable)
        .insert(mappingRows);
      if (mapError) throw mapError;
    }
  }

  return await getWisataByIdForAdmin(id);
}

async function deleteWisataForAdmin(id) {
  // remove mappings first (if no FK cascade)
  const { error: delMapError } = await supabase
    .from(mappingTable)
    .delete()
    .eq("objek_wisata_id", id);
  if (delMapError) throw delMapError;

  const { error } = await supabase.from(wisataTable).delete().eq("id", id);

  if (error) throw error;

  return { id };
}

async function updateWisataPopularityForAdmin(id, popularityStatus) {
  const { data, error } = await supabase
    .from(wisataTable)
    .update({ popularity_status: popularityStatus })
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

module.exports = {
  getAllWisataForAdmin,
  getWisataByIdForAdmin,
  createWisataForAdmin,
  updateWisataForAdmin,
  deleteWisataForAdmin,
  updateWisataPopularityForAdmin,
};
