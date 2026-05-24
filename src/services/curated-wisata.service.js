const supabase = require("../config/supabase");

const wisataTable = "objek_wisata";
const showcaseTable = "wisata_showcase";

async function getCuratedWisataBySection(section, limit) {
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.floor(limit)) : 5;

  const { data: showcaseRows, error: showcaseError } = await supabase
    .from(showcaseTable)
    .select("wisata_id")
    .eq("section", section)
    .order("id", { ascending: true })
    .limit(safeLimit);

  if (showcaseError) throw showcaseError;

  const wisataIds = (showcaseRows || []).map((item) => item.wisata_id);

  if (wisataIds.length === 0) {
    return [];
  }

  const { data: wisataRows, error: wisataError } = await supabase
    .from(wisataTable)
    .select("*")
    .in("id", wisataIds);

  if (wisataError) throw wisataError;

  const wisataMap = new Map((wisataRows || []).map((item) => [item.id, item]));

  return wisataIds.map((id) => wisataMap.get(id)).filter(Boolean);
}

async function replaceCuratedWisataSection(section, wisataIds) {
  const uniqueIds = [...new Set(wisataIds)];

  const { error: validateSectionError } = await supabase
    .from(showcaseTable)
    .select("id")
    .eq("section", section)
    .limit(1);

  if (validateSectionError) throw validateSectionError;

  if (uniqueIds.length === 0) {
    const { error: clearSectionError } = await supabase
      .from(showcaseTable)
      .delete()
      .eq("section", section);

    if (clearSectionError) throw clearSectionError;

    return [];
  }

  const { data: existingRows, error: existingError } = await supabase
    .from(wisataTable)
    .select("id")
    .in("id", uniqueIds);

  if (existingError) throw existingError;

  const existingIds = new Set((existingRows || []).map((item) => item.id));
  const missingIds = uniqueIds.filter((id) => !existingIds.has(id));

  if (missingIds.length > 0) {
    throw new Error(`ID wisata tidak ditemukan: ${missingIds.join(", ")}`);
  }

  const { error: clearSectionError } = await supabase
    .from(showcaseTable)
    .delete()
    .eq("section", section);

  if (clearSectionError) throw clearSectionError;

  const { error: detachError } = await supabase
    .from(showcaseTable)
    .delete()
    .in("wisata_id", uniqueIds);

  if (detachError) throw detachError;

  for (const wisataId of uniqueIds) {
    const { error: insertError } = await supabase.from(showcaseTable).insert({
      wisata_id: wisataId,
      section,
    });

    if (insertError) throw insertError;
  }

  return getCuratedWisataBySection(section, uniqueIds.length);
}

module.exports = {
  getCuratedWisataBySection,
  replaceCuratedWisataSection,
};
