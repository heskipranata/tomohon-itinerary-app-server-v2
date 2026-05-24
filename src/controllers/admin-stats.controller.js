const adminStatsService = require("../services/admin-stats.service");

async function getAdminStats(req, res) {
  try {
    const counts = await adminStatsService.getCounts();

    res.status(200).json({
      message: "Statistik ringkas entitas berhasil diambil",
      data: counts,
    });
  } catch (error) {
    res.status(500).json({
      message: "Gagal mengambil statistik",
      error: error.message,
    });
  }
}

module.exports = { getAdminStats };
