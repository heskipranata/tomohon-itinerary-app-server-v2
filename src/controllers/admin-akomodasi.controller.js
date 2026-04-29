const adminAkomodasiService = require("../services/admin-akomodasi.service");

function parseIdParam(idParam) {
  const id = Number(idParam);

  if (!Number.isInteger(id) || id <= 0) {
    throw new Error("ID akomodasi harus berupa angka positif");
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
    nama: body.nama || body.name,
    kategori: body.kategori || body.category,
    alamat: body.alamat || body.address || body.lokasi,
    nomor_telepon: body.nomor_telepon || body.phone_number || body.phone,
    rating: body.rating,
    latitude: body.latitude,
    longitude: body.longitude,
    url_gambar: body.url_gambar || body.image_url || body.image || body.foto,
  };
}

function buildUpdatePayload(body) {
  if (!body || typeof body !== "object") {
    throw new Error("Body request tidak valid");
  }

  const allowedFields = [
    "nama",
    "kategori",
    "alamat",
    "nomor_telepon",
    "rating",
    "latitude",
    "longitude",
    "url_gambar",
  ];

  const payload = allowedFields.reduce((accumulator, field) => {
    if (body[field] !== undefined) {
      accumulator[field] = body[field];
      return accumulator;
    }

    const aliases = {
      nama: ["name"],
      kategori: ["category"],
      alamat: ["address", "lokasi"],
      nomor_telepon: ["phone_number", "phone", "no_telp", "telp"],
      url_gambar: ["image_url", "image", "foto"],
    };

    const aliasValue = (aliases[field] || []).find(
      (alias) => body[alias] !== undefined,
    );

    if (aliasValue) {
      accumulator[field] = body[aliasValue];
    }

    return accumulator;
  }, {});

  if (Object.keys(payload).length === 0) {
    throw new Error("Minimal 1 field harus dikirim untuk update");
  }

  return payload;
}

async function getAdminAkomodasiList(req, res) {
  try {
    const data = await adminAkomodasiService.getAllAkomodasiForAdmin();

    res.status(200).json({
      message: "Daftar akomodasi berhasil diambil",
      total: data.length,
      data,
    });
  } catch (error) {
    res.status(500).json({
      message: "Gagal mengambil daftar akomodasi",
      error: error.message,
    });
  }
}

async function getAdminAkomodasiById(req, res) {
  try {
    const id = parseIdParam(req.params.id);
    const data = await adminAkomodasiService.getAkomodasiByIdForAdmin(id);

    res.status(200).json({
      message: "Detail akomodasi berhasil diambil",
      data,
    });
  } catch (error) {
    const isInputError = /id|angka/i.test(error.message);
    const isNotFound = /no rows/i.test(error.message);

    res.status(isInputError ? 400 : isNotFound ? 404 : 500).json({
      message: "Gagal mengambil detail akomodasi",
      error: isNotFound ? "Akomodasi tidak ditemukan" : error.message,
    });
  }
}

async function createAdminAkomodasi(req, res) {
  try {
    const payload = buildCreatePayload(req.body);
    const data = await adminAkomodasiService.createAkomodasiForAdmin(payload);

    res.status(201).json({
      message: "Akomodasi berhasil ditambahkan",
      data,
    });
  } catch (error) {
    const isInputError = /wajib|valid/i.test(error.message);

    res.status(isInputError ? 400 : 500).json({
      message: "Gagal menambahkan akomodasi",
      error: error.message,
    });
  }
}

async function updateAdminAkomodasi(req, res) {
  try {
    const id = parseIdParam(req.params.id);
    const payload = buildUpdatePayload(req.body);
    const data = await adminAkomodasiService.updateAkomodasiForAdmin(
      id,
      payload,
    );

    res.status(200).json({
      message: "Akomodasi berhasil diperbarui",
      data,
    });
  } catch (error) {
    const isInputError = /id|angka|minimal|valid/i.test(error.message);
    const isNotFound = /no rows/i.test(error.message);

    res.status(isInputError ? 400 : isNotFound ? 404 : 500).json({
      message: "Gagal memperbarui akomodasi",
      error: isNotFound ? "Akomodasi tidak ditemukan" : error.message,
    });
  }
}

async function deleteAdminAkomodasi(req, res) {
  try {
    const id = parseIdParam(req.params.id);
    await adminAkomodasiService.deleteAkomodasiForAdmin(id);

    res.status(200).json({
      message: "Akomodasi berhasil dihapus",
      data: { id },
    });
  } catch (error) {
    const isInputError = /id|angka/i.test(error.message);

    res.status(isInputError ? 400 : 500).json({
      message: "Gagal menghapus akomodasi",
      error: error.message,
    });
  }
}

module.exports = {
  getAdminAkomodasiList,
  getAdminAkomodasiById,
  createAdminAkomodasi,
  updateAdminAkomodasi,
  deleteAdminAkomodasi,
};
