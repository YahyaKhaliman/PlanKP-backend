const jwt = require("jsonwebtoken");
const { plan_user, log_plankp } = require("../models");
const response = require("../utils/response");
const AuthService = require("../services/auth.service");

const register = async (req, res, next) => {
    try {
        const {
            user_nama,
            user_password,
            user_divisi,
            user_nik,
            user_cabang,
            user_jabatan,
        } = req.body ?? {};
        if (!user_nama || !user_password || !user_divisi) {
            return response.error(
                res,
                "Nama, divisi, dan password wajib diisi",
                400,
            );
        }
        const user = await AuthService.register({
            user_nama,
            user_password,
            user_divisi,
            user_nik,
            user_cabang,
            user_jabatan,
        });
        return response.ok(res, user, "Registrasi berhasil");
    } catch (err) {
        next(err);
    }
};

const login = async (req, res, next) => {
    try {
        const { user_nama, user_password, app_version } = req.body ?? {};
        if (!user_nama || !user_password) {
            if (user_nama) {
                await log_plankp.create({
                    user_nama: user_nama,
                    log_status: "GAGAL",
                    log_keterangan: "Password tidak diisi",
                    log_versi: app_version || null,
                });
            }
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
            await log_plankp.create({
                user_nama: user_nama,
                log_status: "GAGAL",
                log_keterangan: result.message,
                log_versi: app_version || null,
            });
            return response.error(res, result.message, result.status);
        }

        await log_plankp.create({
            user_nama: user_nama,
            log_status: "BERHASIL",
            log_keterangan: "Login berhasil",
            log_versi: app_version || null,
        });
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
        if (password_baru.length < 2) {
            return response.error(res, "Password baru minimal 2 karakter", 400);
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
