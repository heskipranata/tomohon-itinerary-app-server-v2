async function uploadImage(req, res) {
  try {
    // Jika tidak ada file yang dikirim
    if (!req.file) {
      return res
        .status(400)
        .json({ message: "Tidak ada gambar yang diupload" });
    }

    // req.file.path berisi URL gambar dari Cloudinary
    res.status(200).json({
      message: "Gambar berhasil diupload",
      url: req.file.path,
    });
  } catch (error) {
    res.status(500).json({
      message: "Gagal mengupload gambar",
      error: error.message,
    });
  }
}

module.exports = { uploadImage };
