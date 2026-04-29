const adminWisataService = require("../services/destination.service");

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

  const entries = Object.entries(body).filter(([, value]) => value !== undefined);

  if (entries.length === 0) {
    throw new Error("Minimal 1 field harus dikirim untuk update");
  }

  return Object.fromEntries(entries);
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

module.exports = {
  getAdminWisataList,
  getAdminWisataById,
  createAdminWisata,
  updateAdminWisata,
  deleteAdminWisata,
};
