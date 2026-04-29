const jwt = require("jsonwebtoken");

function getTokenFromRequest(req) {
  if (req.cookies && req.cookies.token) {
    return req.cookies.token;
  }

  const authHeader = req.headers.authorization || "";
  if (authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }

  return null;
}

function verifyToken(req, res, next) {
  const token = getTokenFromRequest(req);

  if (!token) {
    return res
      .status(401)
      .json({ message: "Unauthorized: token tidak ditemukan" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ message: "Token tidak valid" });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ message: "Forbidden: Admin only" });
  }

  next();
}

module.exports = {
  verifyToken,
  requireAdmin,
};
