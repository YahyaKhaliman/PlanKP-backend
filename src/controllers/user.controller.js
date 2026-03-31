const { plan_user: User } = require("../models");
const { Op } = require("sequelize");
const response = require("../utils/response");
const { normalizeDivisi } = require("../utils/divisi");

const ALLOWED_JABATAN = ["admin", "user"];

// GET /users?jabatan=&divisi=&q=
const getAll = async (req, res, next) => {
    try {
        const { jabatan, divisi, q } = req.query;
        const where = { user_is_active: 1 };
        const isAdmin = req.user.user_jabatan === "admin";

        if (isAdmin) {
            if (jabatan) {
                if (!ALLOWED_JABATAN.includes(jabatan)) {
                    return response.error(res, "Jabatan tidak valid", 400);
                }
                where.user_jabatan = jabatan;
            }
        } else {
            where.user_jabatan = "user";
        }

        // filter by divisi langsung
        if (divisi) {
            const normalizedDivisi = normalizeDivisi(divisi);
            if (!normalizedDivisi)
                return response.error(res, "Divisi tidak valid", 400);
            where.user_divisi = normalizedDivisi;
        }

        if (q) where.user_nama = { [Op.like]: `%${q}%` };

        // admin hanya lihat user dalam scope divisinya
        if (req.adminScope) {
            where.user_divisi = req.adminScope;
        }

        const data = await User.findAll({
            where,
            order: [
                ["user_divisi", "ASC"],
                ["user_nama", "ASC"],
            ],
        });
        return response.ok(res, data);
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
        } = req.body;
        const normalizedDivisi = req.adminScope || normalizeDivisi(user_divisi);
        if (
            !user_nama ||
            !user_nik ||
            !user_password ||
            !user_jabatan ||
            !(req.adminScope || user_divisi)
        )
            return response.error(
                res,
                "Nama, NIK, password, jabatan, dan divisi wajib diisi",
                400,
            );
        if (!ALLOWED_JABATAN.includes(user_jabatan))
            return response.error(res, "Jabatan tidak valid", 400);
        if (!normalizedDivisi)
            return response.error(res, "Divisi tidak valid", 400);

        const exists = await User.findOne({ where: { user_nik } });
        if (exists) return response.error(res, "NIK sudah digunakan", 400);

        const hashed = await User.hashPassword(user_password);
        const data = await User.create({
            user_nama,
            user_nik,
            user_password: hashed,
            user_jabatan,
            user_divisi: normalizedDivisi,
            user_cabang,
        });
        return response.created(res, data, "User berhasil ditambahkan");
    } catch (err) {
        next(err);
    }
};

// PUT /users/:id
const update = async (req, res, next) => {
    try {
        const data = await User.scope("withPassword").findByPk(req.params.id);
        if (!data) return response.error(res, "User tidak ditemukan", 404);

        const {
            user_nama,
            user_nik,
            user_jabatan,
            user_divisi,
            user_cabang,
            user_password,
        } = req.body;
        const normalizedDivisi =
            user_divisi !== undefined
                ? req.adminScope || normalizeDivisi(user_divisi)
                : null;
        if (user_divisi !== undefined && !normalizedDivisi)
            return response.error(res, "Divisi tidak valid", 400);
        if (
            user_jabatan !== undefined &&
            !ALLOWED_JABATAN.includes(user_jabatan)
        )
            return response.error(res, "Jabatan tidak valid", 400);

        if (user_nama) data.user_nama = user_nama;
        if (user_jabatan) data.user_jabatan = user_jabatan;
        if (user_divisi !== undefined) data.user_divisi = normalizedDivisi;
        if (user_cabang !== undefined) data.user_cabang = user_cabang;

        if (user_nik && user_nik !== data.user_nik) {
            const exists = await User.findOne({ where: { user_nik } });
            if (exists) return response.error(res, "NIK sudah digunakan", 400);
            data.user_nik = user_nik;
        }
        if (user_password)
            data.user_password = await User.hashPassword(user_password);

        await data.save();
        const result = data.toJSON();
        delete result.user_password;
        return response.ok(res, result, "User berhasil diupdate");
    } catch (err) {
        next(err);
    }
};

// PATCH /users/:id/aktif
const toggleAktif = async (req, res, next) => {
    try {
        const data = await User.findByPk(req.params.id);
        if (!data) return response.error(res, "User tidak ditemukan", 404);
        data.user_is_active = data.user_is_active ? 0 : 1;
        await data.save();
        return response.ok(
            res,
            data,
            `User ${data.user_is_active ? "diaktifkan" : "dinonaktifkan"}`,
        );
    } catch (err) {
        next(err);
    }
};

module.exports = { getAll, create, update, toggleAktif };
