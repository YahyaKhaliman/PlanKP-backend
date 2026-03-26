const jwt = require("jsonwebtoken");
const UserService = require("./user.service");
const { normalizeDivisi } = require("../utils/divisi");

class AuthService {
    static async authenticate({ user_nama, user_password }) {
        const user = await UserService.findActiveByName(user_nama);
        if (!user || user.user_password !== user_password)
            return {
                ok: false,
                status: 401,
                message: "Nama pengguna atau password salah",
            };

        const plain = user.toJSON();
        delete plain.user_password;

        const token = jwt.sign(
            {
                id: plain.user_id,
                jabatan: plain.user_jabatan,
                divisi: plain.user_divisi,
            },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || "8h" },
        );

        return {
            ok: true,
            data: { token, user: plain },
        };
    }

    static async register({
        user_nama,
        user_password,
        user_divisi,
        user_nik,
        user_cabang,
        user_jabatan,
    }) {
        const existed = await UserService.findActiveByName(user_nama);
        if (existed) {
            throw new Error("Username sudah digunakan");
        }

        const nik = (user_nik || user_nama).trim();
        const normalizedDivisi = normalizeDivisi(user_divisi);
        if (!normalizedDivisi) {
            const err = new Error("Divisi tidak valid");
            err.status = 400;
            throw err;
        }

        const created = await UserService.createUser({
            user_nama,
            user_nik: nik,
            user_password,
            user_divisi: normalizedDivisi,
            user_jabatan: user_jabatan || "user",
            user_cabang,
            user_is_active: 1,
        });
        const plain = created.toJSON();
        delete plain.user_password;
        const token = jwt.sign(
            {
                id: plain.user_id,
                jabatan: plain.user_jabatan,
                divisi: plain.user_divisi,
            },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || "8h" },
        );
        return { token, user: plain };
    }
}

module.exports = AuthService;
