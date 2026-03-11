const wisataService = require("../services/wisata.service");

async function getWisata(req, res) {
  try {
    const data = await wisataService.getAllWisata();

    res.status(200).json({
      message: "Data berhasil diambil",
      total: data.length,
      data
    });

  } catch (error) {
    res.status(500).json({
      message: "Gagal mengambil data",
      error: error.message
    });
  }

}

module.exports = {
  getWisata
};