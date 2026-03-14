const jwt = require("jsonwebtoken");
const { plan_user } = require("../models");
const response = require("../utils/response");

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

        const user = await plan_user.scope("withPassword").findOne({
            where: { user_nama, user_is_active: 1 },
        });

        if (!user)
            return response.error(
                res,
                "Nama pengguna atau password salah",
                401,
            );

        const valid = await plan_user.cekPassword(
            user_password,
            user.user_password,
        );
        if (!valid)
            return response.error(
                res,
                "Nama pengguna atau password salah",
                401,
            );

        const token = jwt.sign(
            {
                id: user.user_id,
                jabatan: user.user_jabatan,
                divisi_id: user.user_divisi_id,
            },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || "8h" },
        );

        const userData = user.toJSON();
        delete userData.user_password;

        return response.ok(res, { token, user: userData }, "Login berhasil");
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
        const valid = await user.cekPassword(password_lama);
        if (!valid) return response.error(res, "Password lama salah", 400);

        user.user_password = await plan_user.hashPassword(password_baru);
        await user.save();

        return response.ok(res, null, "Password berhasil diubah");
    } catch (err) {
        next(err);
    }
};

module.exports = { login, me, changePassword };
