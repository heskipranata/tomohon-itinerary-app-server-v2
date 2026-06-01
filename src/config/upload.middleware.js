const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("../config/cloudinary");

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    // Tentukan nama folder spesifik di Cloudinary di sini
    folder: "itinerary-app/destinasi",
    // Format yang diizinkan
    allowed_formats: ["jpg", "jpeg", "png", "webp"],
    // Opsional: transformasi gambar sebelum disimpan (misal: kompresi/resize)
    // transformation: [{ width: 800, height: 600, crop: 'limit' }]
  },
});

const upload = multer({ storage: storage });

module.exports = upload;
