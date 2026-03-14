const jwt = require("jsonwebtoken");
const { plan_user } = require("../models");
const response = require("../utils/response");
const AuthService = require("../services/auth.service");

const register = async (req, res, next) => {
    try {
        const { user_nama, user_password, user_divisi, user_nik, user_cabang } =
            req.body ?? {};
        if (!user_nama || !user_password) {
            return response.error(
                res,
                "Nama pengguna dan password wajib diisi",
                400,
            );
        }
        const user = await AuthService.register({
            user_nama,
            user_password,
            user_divisi,
            user_nik,
            user_cabang,
        });
        return response.ok(res, user, "Registrasi berhasil");
    } catch (err) {
        next(err);
    }
};

const login = async (req, res, next) => {
    try {
        const { user_nama, user_password } = req.body ?? {};
        if (!user_nama || !user_password) {
            return response.error(
                res,
                "Nama pengguna dan password wajib diisi",
                400,
            );
        }

        const result = await AuthService.authenticate({
            user_nama,
            user_password,
        });
        if (!result.ok) {
            return response.error(res, result.message, result.status);
        }

        return response.ok(res, result.data, "Login berhasil");
    } catch (err) {
        next(err);
    }
};

const me = async (req, res) => {
    const user = await plan_user.findOne({
        where: { user_id: req.user.user_id },
    });
    return response.ok(res, user);
};

const changePassword = async (req, res, next) => {
    try {
        const { password_lama, password_baru } = req.body;
        if (!password_lama || !password_baru) {
            return response.error(
                res,
                "Password lama dan baru wajib diisi",
                400,
            );
        }
        if (password_baru.length < 6) {
            return response.error(res, "Password baru minimal 6 karakter", 400);
        }

        const user = await plan_user
            .scope("withPassword")
            .findByPk(req.user.user_id);
        if (user.user_password !== password_lama)
            return response.error(res, "Password lama salah", 400);

        user.user_password = password_baru;
        await user.save();

        return response.ok(res, null, "Password berhasil diubah");
    } catch (err) {
        next(err);
    }
};

module.exports = { login, me, changePassword, register };
