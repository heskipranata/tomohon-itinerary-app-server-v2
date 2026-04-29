const jwt = require("jsonwebtoken");
const authService = require("../services/auth.service");

function buildCookieOptions() {
  const isProduction = process.env.NODE_ENV === "production";

  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    maxAge: 24 * 60 * 60 * 1000,
  };
}

function issueAuthCookie(res, user) {
  const token = jwt.sign(
    { id: user.id, email: user.email, nama: user.nama, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "1d" },
  );

  res.cookie("token", token, buildCookieOptions());
}

async function registerUser(req, res) {
  try {
    const { nama, email, password, minatKategori } = req.body;

    const user = await authService.registerUser({
      nama,
      email,
      password,
      minatKategori,
    });

    issueAuthCookie(res, user);

    res.status(201).json({
      message: "Register berhasil",
      user: {
        id: user.id,
        nama: user.nama,
        email: user.email,
        role: user.role,
        minatKategori: user.minat_kategori,
      },
    });
  } catch (err) {
    res.status(400).json({
      message: err.message,
    });
  }
}

async function loginUser(req, res) {
  try {
    const { nama, password } = req.body;

    const user = await authService.loginUser(nama, password);

    issueAuthCookie(res, user);

    res.json({
      message: "Login successfully",
      user: {
        id: user.id,
        nama: user.nama,
        email: user.email,
        role: user.role,
        minatKategori: user.minat_kategori,
      },
    });
  } catch (err) {
    res.status(401).json({
      message: err.message,
    });
  }
}

async function loginAdmin(req, res) {
  try {
    const { email, password } = req.body;

    const admin = await authService.loginAdmin(email, password);

    issueAuthCookie(res, admin);

    res.json({
      message: "Login successfully",
      admin: {
        id: admin.id,
        email: admin.email,
        role: admin.role,
      },
    });
  } catch (err) {
    res.status(401).json({
      message: err.message,
    });
  }
}

async function logout(req, res) {
  try {
    res.clearCookie("token", {
      httpOnly: true,
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      secure: process.env.NODE_ENV === "production",
    });

    res.json({
      message: "Logout successfully",
    });
  } catch (err) {
    res.status(500).json({
      message: err.message,
    });
  }
}

module.exports = {
  registerUser,
  loginUser,
  loginAdmin,
  logout,
};
