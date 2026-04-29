const adminTempatMakanService = require("../services/admin-tempat-makan.service");

function parseIdParam(idParam) {
  const id = Number(idParam);

  if (!Number.isInteger(id) || id <= 0) {
    throw new Error("ID tempat makan harus berupa angka positif");
  }

  return id;
}

function buildCreatePayload(body) {
  if (!body || typeof body !== "object") {
    throw new Error("Body request tidak valid");
  }

  if (!body.nama && !body.name) {
    throw new Error("nama wajib diisi");
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

async function getAdminTempatMakanList(req, res) {
  try {
    const data = await adminTempatMakanService.getAllTempatMakanForAdmin();

    res.status(200).json({
      message: "Daftar tempat makan berhasil diambil",
      total: data.length,
      data,
    });
  } catch (error) {
    res.status(500).json({
      message: "Gagal mengambil daftar tempat makan",
      error: error.message,
    });
  }
}

async function getAdminTempatMakanById(req, res) {
  try {
    const id = parseIdParam(req.params.id);
    const data = await adminTempatMakanService.getTempatMakanByIdForAdmin(id);

    res.status(200).json({
      message: "Detail tempat makan berhasil diambil",
      data,
    });
  } catch (error) {
    const isInputError = /id|angka/i.test(error.message);
    const isNotFound = /no rows/i.test(error.message);

    res.status(isInputError ? 400 : isNotFound ? 404 : 500).json({
      message: "Gagal mengambil detail tempat makan",
      error: isNotFound ? "Tempat makan tidak ditemukan" : error.message,
    });
  }
}

async function createAdminTempatMakan(req, res) {
  try {
    const payload = buildCreatePayload(req.body);
    const data =
      await adminTempatMakanService.createTempatMakanForAdmin(payload);

    res.status(201).json({
      message: "Tempat makan berhasil ditambahkan",
      data,
    });
  } catch (error) {
    const isInputError = /wajib|valid/i.test(error.message);

    res.status(isInputError ? 400 : 500).json({
      message: "Gagal menambahkan tempat makan",
      error: error.message,
    });
  }
}

async function updateAdminTempatMakan(req, res) {
  try {
    const id = parseIdParam(req.params.id);
    const payload = buildUpdatePayload(req.body);
    const data = await adminTempatMakanService.updateTempatMakanForAdmin(
      id,
      payload,
    );

    res.status(200).json({
      message: "Tempat makan berhasil diperbarui",
      data,
    });
  } catch (error) {
    const isInputError = /id|angka|minimal|valid/i.test(error.message);
    const isNotFound = /no rows/i.test(error.message);

    res.status(isInputError ? 400 : isNotFound ? 404 : 500).json({
      message: "Gagal memperbarui tempat makan",
      error: isNotFound ? "Tempat makan tidak ditemukan" : error.message,
    });
  }
}

async function deleteAdminTempatMakan(req, res) {
  try {
    const id = parseIdParam(req.params.id);
    await adminTempatMakanService.deleteTempatMakanForAdmin(id);

    res.status(200).json({
      message: "Tempat makan berhasil dihapus",
      data: { id },
    });
  } catch (error) {
    const isInputError = /id|angka/i.test(error.message);

    res.status(isInputError ? 400 : 500).json({
      message: "Gagal menghapus tempat makan",
      error: error.message,
    });
  }
}

module.exports = {
  getAdminTempatMakanList,
  getAdminTempatMakanById,
  createAdminTempatMakan,
  updateAdminTempatMakan,
  deleteAdminTempatMakan,
};
