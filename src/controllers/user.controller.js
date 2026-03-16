const { User } = require("../models");
const { Op } = require("sequelize");
const response = require("../utils/response");

// Mapping inv_kategori → user_divisi
const KATEGORI_DIVISI = {
    "Mesin Jahit": ["Teknisi Jahit"],
    "Mesin Umum": ["Teknisi Umum"],
    Hardware: ["IT Support"],
    APAR: ["Teknisi Jahit", "Teknisi Umum", "IT Support", "Satpam"],
    Lainnya: [
        "Teknisi Jahit",
        "Teknisi Umum",
        "IT Support",
        "Satpam",
        "Kebersihan",
    ],
};

// GET /users?jabatan=&divisi=&q=&kategori=Hardware
const getAll = async (req, res, next) => {
    try {
        const { jabatan, divisi, q, kategori } = req.query;
        const where = { user_is_active: 1 };

        if (jabatan) where.user_jabatan = jabatan;

        // filter by divisi langsung
        if (divisi) where.user_divisi = divisi;

        // filter by kategori inventaris → otomatis resolve divisi
        if (kategori && KATEGORI_DIVISI[kategori]) {
            where.user_divisi = { [Op.in]: KATEGORI_DIVISI[kategori] };
        }

        if (q) where.user_nama = { [Op.like]: `%${q}%` };

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
        if (
            !user_nama ||
            !user_nik ||
            !user_password ||
            !user_jabatan ||
            !user_divisi
        )
            return response.error(
                res,
                "Nama, NIK, password, jabatan, dan divisi wajib diisi",
                400,
            );

        const exists = await User.findOne({ where: { user_nik } });
        if (exists) return response.error(res, "NIK sudah digunakan", 400);

        const hashed = await User.hashPassword(user_password);
        const data = await User.create({
            user_nama,
            user_nik,
            user_password: hashed,
            user_jabatan,
            user_divisi,
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

        if (user_nama) data.user_nama = user_nama;
        if (user_jabatan) data.user_jabatan = user_jabatan;
        if (user_divisi) data.user_divisi = user_divisi;
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

// GET /users/mapping-kategori — expose mapping untuk FE
const getMappingKategori = (req, res) => response.ok(res, KATEGORI_DIVISI);

module.exports = { getAll, create, update, toggleAktif, getMappingKategori };
