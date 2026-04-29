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

async function loginAdmin(req, res) {
  try {
    const { email, password } = req.body;

    const admin = await authService.loginAdmin(email, password);

    const token = jwt.sign(
      { id: admin.id, email: admin.email, role: admin.role },
      process.env.JWT_SECRET,
      { expiresIn: "1d" },
    );

    res.cookie("token", token, buildCookieOptions());

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

async function logoutAdmin(req, res) {
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
  loginAdmin,
  logoutAdmin,
};
