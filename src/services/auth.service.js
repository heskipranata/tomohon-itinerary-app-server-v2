const supabase = require("../config/supabase");

async function loginAdmin(email, password) {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("email", email)
    .eq("role", "admin")
    .single();

  if (error || !data) {
    throw new Error("Akun tidak ditemukan");
  }

  if (password !== data.password) {
    throw new Error("Email atau password salah");
  }

  return data;
}

module.exports = {
  loginAdmin,
};
