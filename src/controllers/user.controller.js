const { Op } = require("sequelize");
const { plan_user: User } = require("../models");
const response = require("../utils/response");

const sanitize = (userInstance) => {
    const plain = userInstance.toJSON();
    delete plain.user_password;
    return plain;
};

// GET /users
const getAll = async (req, res, next) => {
    try {
        const { jabatan, aktif, q } = req.query;
        const where = {};

        if (jabatan) where.user_jabatan = jabatan;
        if (aktif !== undefined)
            where.user_is_active = aktif === "true" ? 1 : 0;
        if (q) {
            where[Op.or] = [
                { user_nama: { [Op.like]: `%${q}%` } },
                { user_nik: { [Op.like]: `%${q}%` } },
            ];
        }

        const users = await User.findAll({
            where,
            order: [["user_nama", "ASC"]],
        });

        return response.ok(res, users);
    } catch (err) {
        next(err);
    }
};

// POST /users
const create = async (req, res, next) => {
    try {
        const {
            user_nama,
            user_nik,
            user_password,
            user_jabatan,
            user_divisi,
            user_cabang,
        } = req.body || {};

        if (!user_nama || !user_nik || !user_password || !user_jabatan) {
            return response.error(
                res,
                "Nama, NIK, password, dan jabatan wajib diisi",
                400,
            );
        }

        const existed = await User.scope("withPassword").findOne({
            where: { user_nik },
        });
        if (existed) {
            return response.error(res, "NIK sudah digunakan", 400);
        }

        const created = await User.create({
            user_nama,
            user_nik,
            user_password,
            user_jabatan,
            user_divisi,
            user_cabang,
            user_is_active: 1,
        });

        return response.created(
            res,
            sanitize(created),
            "User berhasil ditambahkan",
        );
    } catch (err) {
        next(err);
    }
};

// PUT /users/:id
const update = async (req, res, next) => {
    try {
        const user = await User.scope("withPassword").findByPk(req.params.id);
        if (!user) return response.error(res, "User tidak ditemukan", 404);

        const {
            user_nama,
            user_nik,
            user_password,
            user_jabatan,
            user_divisi,
            user_cabang,
        } = req.body || {};

        if (user_nik && user_nik !== user.user_nik) {
            const existed = await User.findOne({ where: { user_nik } });
            if (existed) {
                return response.error(res, "NIK sudah digunakan", 400);
            }
        }

        const fields = {
            user_nama,
            user_nik,
            user_jabatan,
            user_divisi,
            user_cabang,
        };

        Object.entries(fields).forEach(([key, value]) => {
            if (value !== undefined) user[key] = value;
        });

        if (user_password) user.user_password = user_password;

        await user.save();

        return response.ok(res, sanitize(user), "User berhasil diperbarui");
    } catch (err) {
        next(err);
    }
};

// PATCH /users/:id/aktif
const toggleAktif = async (req, res, next) => {
    try {
        const user = await User.findByPk(req.params.id);
        if (!user) return response.error(res, "User tidak ditemukan", 404);

        user.user_is_active = user.user_is_active ? 0 : 1;
        await user.save();

        return response.ok(
            res,
            user,
            `User ${user.user_is_active ? "diaktifkan" : "dinonaktifkan"}`,
        );
    } catch (err) {
        next(err);
    }
};

module.exports = { getAll, create, update, toggleAktif };
