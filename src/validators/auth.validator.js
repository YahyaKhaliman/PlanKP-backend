const loginSchema = (req) => {
    const { user_nama, user_password } = req.body || {};
    if (!user_nama || !user_password) {
        return { error: "user_nama dan user_password wajib diisi" };
    }
    if (user_password.length <= 2) {
        return { error: "user_password minimal 3 karakter" };
    }
    return { error: null };
};

const registerSchema = (req) => {
    const baseValidation = loginSchema(req);
    if (baseValidation.error) return baseValidation;

    const { user_divisi, user_nik } = req.body || {};
    if (!user_divisi) {
        return { error: "user_divisi wajib diisi" };
    }
    if (user_nik && String(user_nik).length < 4) {
        return { error: "user_nik minimal 4 karakter" };
    }
    return { error: null };
};

const changePasswordSchema = (req) => {
    const { password_lama, password_baru } = req.body || {};
    if (!password_lama || !password_baru) {
        return { error: "password_lama dan password_baru wajib diisi" };
    }
    if (password_baru.length < 6) {
        return { error: "password_baru minimal 6 karakter" };
    }
    return { error: null };
};

module.exports = { loginSchema, registerSchema, changePasswordSchema };
