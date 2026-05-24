const adminWisataService = require("../services/destination.service");
const curatedWisataService = require("../services/curated-wisata.service");

const POPULARITY_ALIASES = {
  populer: "populer",
  popular: "populer",
  hidden_gem: "hidden_gem",
  hiddengem: "hidden_gem",
  hidden: "hidden_gem",
  kurang_populer_bagus: "hidden_gem",
  netral: "netral",
  normal: "netral",
};

const CURATED_SECTION_ALIASES = {
  populer: "populer",
  popular: "populer",
  hidden_gem: "hidden_gem",
  hiddengem: "hidden_gem",
  hidden: "hidden_gem",
  kurang_populer_bagus: "hidden_gem",
  bagus_kurang_populer: "hidden_gem",
  baru: "baru",
  new: "baru",
  wisata_baru: "baru",
};

function parseIdParam(idParam) {
  const id = Number(idParam);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error("ID wisata harus berupa angka positif");
  }
  return id;
}

function buildCreatePayload(body) {
  if (!body || typeof body !== "object") {
    throw new Error("Body request tidak valid");
  }

  if (!body.nama_objek_wisata || !body.lokasi) {
    throw new Error("nama_objek_wisata dan lokasi wajib diisi");
  }

  return {
    ...body,
  };
}

function buildUpdatePayload(body) {
  if (!body || typeof body !== "object") {
    throw new Error("Body request tidak valid");
  }

  const entries = Object.entries(body).filter(
    ([, value]) => value !== undefined,
  );

  if (entries.length === 0) {
    throw new Error("Minimal 1 field harus dikirim untuk update");
  }

  return Object.fromEntries(entries);
}

function normalizePopularityStatus(input) {
  const raw = String(input || "")
    .trim()
    .toLowerCase();

  const normalized = POPULARITY_ALIASES[raw];

  if (!normalized) {
    throw new Error(
      "popularityStatus tidak valid. Gunakan: populer | hidden_gem | netral",
    );
  }

  return normalized;
}

function normalizeCuratedSection(input) {
  const raw = String(input || "")
    .trim()
    .toLowerCase();

  const normalized = CURATED_SECTION_ALIASES[raw];

  if (!normalized) {
    throw new Error(
      "section tidak valid. Gunakan: populer | hidden_gem | baru",
    );
  }

  return normalized;
}

function parseWisataIds(body) {
  if (!body || typeof body !== "object") {
    throw new Error("Body request tidak valid");
  }

  const rawIds = body.wisataIds;

  if (!Array.isArray(rawIds)) {
    throw new Error("wisataIds wajib berupa array");
  }

  const parsedIds = rawIds.map((item) => Number(item));
  const invalidId = parsedIds.find((id) => !Number.isInteger(id) || id <= 0);

  if (invalidId) {
    throw new Error("Setiap item di wisataIds harus angka positif");
  }

  return parsedIds;
}

async function getAdminWisataList(req, res) {
  try {
    const data = await adminWisataService.getAllWisataForAdmin();

    res.status(200).json({
      message: "Daftar objek wisata berhasil diambil",
      total: data.length,
      data,
    });
  } catch (error) {
    res.status(500).json({
      message: "Gagal mengambil daftar objek wisata",
      error: error.message,
    });
  }
}

async function getAdminWisataById(req, res) {
  try {
    const id = parseIdParam(req.params.id);
    const data = await adminWisataService.getWisataByIdForAdmin(id);

    res.status(200).json({
      message: "Detail objek wisata berhasil diambil",
      data,
    });
  } catch (error) {
    const isInputError = /id|angka/i.test(error.message);
    const isNotFound = /no rows/i.test(error.message);

    res.status(isInputError ? 400 : isNotFound ? 404 : 500).json({
      message: "Gagal mengambil detail objek wisata",
      error: isNotFound ? "Objek wisata tidak ditemukan" : error.message,
    });
  }
}

async function createAdminWisata(req, res) {
  try {
    const payload = buildCreatePayload(req.body);
    const data = await adminWisataService.createWisataForAdmin(payload);

    res.status(201).json({
      message: "Objek wisata berhasil ditambahkan",
      data,
    });
  } catch (error) {
    const isInputError = /wajib|valid/i.test(error.message);

    res.status(isInputError ? 400 : 500).json({
      message: "Gagal menambahkan objek wisata",
      error: error.message,
    });
  }
}

async function updateAdminWisata(req, res) {
  try {
    const id = parseIdParam(req.params.id);
    const payload = buildUpdatePayload(req.body);
    const data = await adminWisataService.updateWisataForAdmin(id, payload);

    res.status(200).json({
      message: "Objek wisata berhasil diperbarui",
      data,
    });
  } catch (error) {
    const isInputError = /id|angka|minimal|valid/i.test(error.message);
    const isNotFound = /no rows/i.test(error.message);

    res.status(isInputError ? 400 : isNotFound ? 404 : 500).json({
      message: "Gagal memperbarui objek wisata",
      error: isNotFound ? "Objek wisata tidak ditemukan" : error.message,
    });
  }
}

async function deleteAdminWisata(req, res) {
  try {
    const id = parseIdParam(req.params.id);
    await adminWisataService.deleteWisataForAdmin(id);

    res.status(200).json({
      message: "Objek wisata berhasil dihapus",
      data: { id },
    });
  } catch (error) {
    const isInputError = /id|angka/i.test(error.message);

    res.status(isInputError ? 400 : 500).json({
      message: "Gagal menghapus objek wisata",
      error: error.message,
    });
  }
}

async function updateAdminWisataPopularity(req, res) {
  try {
    const id = parseIdParam(req.params.id);
    const popularityStatus = normalizePopularityStatus(
      req.body?.popularityStatus,
    );

    const data = await adminWisataService.updateWisataPopularityForAdmin(
      id,
      popularityStatus,
    );

    res.status(200).json({
      message: "Status popularitas wisata berhasil diperbarui",
      data,
    });
  } catch (error) {
    const isInputError = /id|angka|valid/i.test(error.message);
    const isNotFound = /no rows/i.test(error.message);

    res.status(isInputError ? 400 : isNotFound ? 404 : 500).json({
      message: "Gagal memperbarui status popularitas wisata",
      error: isNotFound ? "Objek wisata tidak ditemukan" : error.message,
    });
  }
}

async function getAdminCuratedWisataSection(req, res) {
  try {
    const section = normalizeCuratedSection(req.params.section);
    const data = await curatedWisataService.getCuratedWisataBySection(
      section,
      100,
    );

    res.status(200).json({
      message: "Daftar kurasi wisata berhasil diambil",
      section,
      total: data.length,
      data,
    });
  } catch (error) {
    const isInputError = /section|valid/i.test(error.message);

    res.status(isInputError ? 400 : 500).json({
      message: "Gagal mengambil daftar kurasi wisata",
      error: error.message,
    });
  }
}

async function replaceAdminCuratedWisataSection(req, res) {
  try {
    const section = normalizeCuratedSection(req.params.section);
    const wisataIds = parseWisataIds(req.body);
    const data = await curatedWisataService.replaceCuratedWisataSection(
      section,
      wisataIds,
    );

    res.status(200).json({
      message: "Kurasi wisata berhasil diperbarui",
      section,
      total: data.length,
      data,
    });
  } catch (error) {
    const isInputError = /section|valid|array|angka|id wisata/i.test(
      error.message,
    );

    res.status(isInputError ? 400 : 500).json({
      message: "Gagal memperbarui kurasi wisata",
      error: error.message,
    });
  }
}

module.exports = {
  getAdminWisataList,
  getAdminWisataById,
  createAdminWisata,
  updateAdminWisata,
  deleteAdminWisata,
  updateAdminWisataPopularity,
  getAdminCuratedWisataSection,
  replaceAdminCuratedWisataSection,
};
