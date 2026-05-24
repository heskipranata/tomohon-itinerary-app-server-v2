const supabase = require("../config/supabase");
const crypto = require("crypto");

const PASSWORD_ALGORITHM = "pbkdf2";
const PASSWORD_ITERATIONS = 120000;
const PASSWORD_KEY_LENGTH = 64;
const PASSWORD_DIGEST = "sha512";

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeMinatKategori(minatKategori) {
  if (Array.isArray(minatKategori)) {
    return minatKategori.map((item) => normalizeText(item)).filter(Boolean);
  }

  if (typeof minatKategori === "string") {
    return minatKategori
      .split(",")
      .map((item) => normalizeText(item))
      .filter(Boolean);
  }

  return [];
}

function validateUserId(userId) {
  const id = normalizeText(userId);

  if (!id) {
    throw new Error("User tidak valid");
  }

  return id;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto
    .pbkdf2Sync(
      password,
      salt,
      PASSWORD_ITERATIONS,
      PASSWORD_KEY_LENGTH,
      PASSWORD_DIGEST,
    )
    .toString("hex");

  return [PASSWORD_ALGORITHM, PASSWORD_ITERATIONS, salt, hash].join("$");
}

function verifyPassword(password, storedPassword) {
  if (!storedPassword) {
    return false;
  }

  const parts = storedPassword.split("$");

  if (parts.length !== 4 || parts[0] !== PASSWORD_ALGORITHM) {
    return password === storedPassword;
  }

  const [, iterationsText, salt, expectedHash] = parts;
  const actualHash = crypto
    .pbkdf2Sync(
      password,
      salt,
      Number(iterationsText),
      expectedHash.length / 2,
      PASSWORD_DIGEST,
    )
    .toString("hex");

  return crypto.timingSafeEqual(
    Buffer.from(actualHash, "hex"),
    Buffer.from(expectedHash, "hex"),
  );
}

async function findUserByField(field, value, role) {
  let query = supabase.from("users").select("id").eq(field, value);

  if (role) {
    query = query.eq("role", role);
  }

  const { data, error } = await query.limit(1);

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

async function registerUser({ nama, email, password, minatKategori }) {
  const normalizedNama = normalizeText(nama);
  const normalizedEmail = normalizeText(email).toLowerCase();
  const normalizedPassword = normalizeText(password);
  const normalizedMinatKategori = normalizeMinatKategori(minatKategori);

  if (!normalizedNama || !normalizedEmail || !normalizedPassword) {
    throw new Error("Nama, email, dan password wajib diisi");
  }

  const [existingByNama, existingByEmail] = await Promise.all([
    findUserByField("nama", normalizedNama),
    findUserByField("email", normalizedEmail),
  ]);

  if (existingByNama.length > 0) {
    throw new Error("Nama sudah terdaftar");
  }

  if (existingByEmail.length > 0) {
    throw new Error("Email sudah terdaftar");
  }

  const { data, error } = await supabase
    .from("users")
    .insert([
      {
        nama: normalizedNama,
        email: normalizedEmail,
        password: hashPassword(normalizedPassword),
        role: "user",
        minat_kategori: normalizedMinatKategori,
      },
    ])
    .select("id, nama, email, role, minat_kategori")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

async function loginUser(email, password) {
  const normalizedEmail = normalizeText(email).toLowerCase();
  const normalizedPassword = normalizeText(password);

  if (!normalizedEmail || !normalizedPassword) {
    throw new Error("Email dan password wajib diisi");
  }

  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("email", normalizedEmail)
    .eq("role", "user")
    .single();

  if (error || !data) {
    throw new Error("Akun tidak ditemukan");
  }

  if (!verifyPassword(normalizedPassword, data.password)) {
    throw new Error("Email atau password salah");
  }

  return data;
}

async function loginAdmin(email, password) {
  const normalizedEmail = normalizeText(email).toLowerCase();
  const normalizedPassword = normalizeText(password);

  if (!normalizedEmail || !normalizedPassword) {
    throw new Error("Email dan password wajib diisi");
  }

  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("email", normalizedEmail)
    .eq("role", "admin")
    .single();

  if (error || !data) {
    throw new Error("Akun tidak ditemukan");
  }

  if (!verifyPassword(normalizedPassword, data.password)) {
    throw new Error("Email atau password salah");
  }

  return data;
}

async function registerAdmin({ email, password, nama }) {
  const normalizedEmail = normalizeText(email).toLowerCase();
  const normalizedPassword = normalizeText(password);

  // Generate nama dari email jika tidak diberikan
  const adminNama = normalizeText(nama) || normalizedEmail.split("@")[0];

  if (!normalizedEmail || !normalizedPassword) {
    throw new Error("Email dan password wajib diisi");
  }

  const [existingByEmail, existingByNama] = await Promise.all([
    findUserByField("email", normalizedEmail),
    findUserByField("nama", adminNama),
  ]);

  if (existingByEmail.length > 0) {
    throw new Error("Email sudah terdaftar");
  }

  if (existingByNama.length > 0) {
    throw new Error("Nama sudah terdaftar");
  }

  const { data, error } = await supabase
    .from("users")
    .insert([
      {
        nama: adminNama,
        email: normalizedEmail,
        password: hashPassword(normalizedPassword),
        role: "admin",
        minat_kategori: [],
      },
    ])
    .select("id, nama, email, role")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

async function getUserProfileById(userId) {
  const id = validateUserId(userId);

  const { data, error } = await supabase
    .from("users")
    .select("id, nama, email, role, minat_kategori, created_at, updated_at")
    .eq("id", id)
    .single();

  if (error || !data) {
    throw new Error("User tidak ditemukan");
  }

  return data;
}

async function updateUserMinatKategori(userId, minatKategori) {
  const id = validateUserId(userId);
  const normalizedMinatKategori = normalizeMinatKategori(minatKategori);

  const { data, error } = await supabase
    .from("users")
    .update({ minat_kategori: normalizedMinatKategori })
    .eq("id", id)
    .select("id, nama, email, role, minat_kategori, created_at, updated_at")
    .single();

  if (error || !data) {
    throw new Error(error?.message || "User tidak ditemukan");
  }

  return data;
}

module.exports = {
  registerUser,
  loginUser,
  loginAdmin,
  registerAdmin,
  getUserProfileById,
  updateUserMinatKategori,
};
