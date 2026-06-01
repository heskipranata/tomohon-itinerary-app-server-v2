const cloudinary = require("cloudinary").v2;

// Sangat disarankan memindahkan kredensial ini ke file .env
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || "dewi8c1ll",
  api_key: process.env.CLOUDINARY_API_KEY || "481357187418361",
  api_secret:
    process.env.CLOUDINARY_API_SECRET || "sDVT5x_O1BXmclArBkmMY7HQPuE",
});

module.exports = cloudinary;
