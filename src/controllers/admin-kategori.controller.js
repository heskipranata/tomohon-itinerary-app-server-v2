const adminKategoriService = require("../services/destination.service");

function parseIdParam(idParam) {
  const id = Number(idParam);

  if (!Number.isInteger(id) || id <= 0) {
    throw new Error("ID kategori harus berupa angka positif");
  }

  return id;
}

function buildCreatePayload(body) {
  if (!body || typeof body !== "object") {
    throw new Error("Body request tidak valid");
  }

  return {
    nama: body.nama || body.nama_kategori,
    nama_kategori: body.nama_kategori || body.nama,
  };
}

async function getAdminKategoriList(req, res) {
  try {
    const data = await adminKategoriService.getAllKategoriForAdmin();

    res.status(200).json({
      message: "Daftar kategori berhasil diambil",
      total: data.length,
      data,
    });
  } catch (error) {
    res.status(500).json({
      message: "Gagal mengambil daftar kategori",
      error: error.message,
    });
  }
}

async function createAdminKategori(req, res) {
  try {
    const payload = buildCreatePayload(req.body);
    const data = await adminKategoriService.createKategoriForAdmin(payload);

    res.status(201).json({
      message: "Kategori berhasil ditambahkan",
      data,
    });
  } catch (error) {
    const isInputError = /wajib|valid|sudah ada/i.test(error.message);

    res.status(isInputError ? 400 : 500).json({
      message: "Gagal menambahkan kategori",
      error: error.message,
    });
  }
}

async function deleteAdminKategori(req, res) {
  try {
    const id = parseIdParam(req.params.id);
    const data = await adminKategoriService.deleteKategoriForAdmin(id);

    res.status(200).json({
      message: "Kategori berhasil dihapus",
      data,
    });
  } catch (error) {
    const isInputError = /id|angka/i.test(error.message);
    const isUsedError = /dipakai/i.test(error.message);

    res.status(isInputError ? 400 : isUsedError ? 409 : 500).json({
      message: "Gagal menghapus kategori",
      error: error.message,
    });
  }
}

module.exports = {
  getAdminKategoriList,
  createAdminKategori,
  deleteAdminKategori,
};
