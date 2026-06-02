const jwt = require("jsonwebtoken");
const authService = require("../services/auth.service");

function buildCookieOptions() {
  const isProduction = process.env.NODE_ENV === "production";

  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    secure: true,
    sameSite: "none",
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
  return token;
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

    const token = issueAuthCookie(res, user);

    res.status(201).json({
      message: "Register berhasil",
      token,
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
    const { email, password } = req.body;

    const user = await authService.loginUser(email, password);

    const token = issueAuthCookie(res, user);

    res.json({
      message: "Login successfully",
      token,
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
    const token = issueAuthCookie(res, admin);

    res.json({
      message: "Login successfully",
      token,
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

async function getProfile(req, res) {
  try {
    const profile = await authService.getUserProfileById(req.user.id);

    res.json({
      message: "Profil user berhasil diambil",
      user: {
        id: profile.id,
        nama: profile.nama,
        email: profile.email,
        role: profile.role,
        minatKategori: profile.minat_kategori,
        createdAt: profile.created_at,
        updatedAt: profile.updated_at,
      },
    });
  } catch (err) {
    res.status(404).json({
      message: err.message,
    });
  }
}

async function updateMinatKategori(req, res) {
  try {
    const { minatKategori } = req.body;
    const user = await authService.updateUserMinatKategori(
      req.user.id,
      minatKategori,
    );

    res.json({
      message: "Minat kategori berhasil diperbarui",
      user: {
        id: user.id,
        nama: user.nama,
        email: user.email,
        role: user.role,
        minatKategori: user.minat_kategori,
        createdAt: user.created_at,
        updatedAt: user.updated_at,
      },
    });
  } catch (err) {
    const isInputError = /valid/i.test(err.message);

    res.status(isInputError ? 400 : 500).json({
      message: err.message,
    });
  }
}

async function registerAdmin(req, res) {
  try {
    const { email, password, nama } = req.body;

    const admin = await authService.registerAdmin({
      email,
      password,
      nama,
    });

    res.status(201).json({
      message: "Register admin berhasil",
      admin: {
        id: admin.id,
        nama: admin.nama,
        email: admin.email,
        role: admin.role,
      },
    });
  } catch (err) {
    res.status(400).json({
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
  registerAdmin,
  getProfile,
  updateMinatKategori,
  logout,
};
