const { plan_inventaris: Inventaris, plan_user: User } = require("../models");
const { Op } = require("sequelize");
const response = require("../utils/response");

// GET /inventaris
const getAll = async (req, res, next) => {
    try {
        const { kategori, jenis, q, aktif } = req.query;
        const where = {};
        if (kategori) where.inv_kategori = kategori;
        if (jenis) where.inv_jenis = jenis;
        if (aktif !== undefined) where.inv_is_active = aktif === "true" ? 1 : 0;
        if (q) where.inv_nama = { [Op.like]: `%${q}%` };

        const data = await Inventaris.findAll({
            where,
            include: [
                {
                    model: User,
                    as: "inv_created_by_plan_user",
                    attributes: ["user_id", "user_nama"],
                },
            ],
            order: [["inv_nama", "ASC"]],
        });
        return response.ok(res, data);
    } catch (err) {
        next(err);
    }
};

// GET /inventaris/:id
const getOne = async (req, res, next) => {
    try {
        const data = await Inventaris.findByPk(req.params.id, {
            include: [
                {
                    model: User,
                    as: "inv_created_by_plan_user",
                    attributes: ["user_id", "user_nama"],
                },
            ],
        });
        if (!data)
            return response.error(res, "Inventaris tidak ditemukan", 404);
        return response.ok(res, data);
    } catch (err) {
        next(err);
    }
};

// POST /inventaris
const create = async (req, res, next) => {
    try {
        const {
            inv_no,
            inv_nama,
            inv_kategori,
            inv_jenis,
            inv_lokasi,
            inv_merk,
            inv_serial_number,
            inv_pic,
            inv_tgl_beli,
            inv_kondisi,
            inv_notes,
        } = req.body;

        if (!inv_no || !inv_nama || !inv_kategori || !inv_jenis) {
            return response.error(
                res,
                "No inventaris, nama, kategori, dan jenis wajib diisi",
                400,
            );
        }

        const exists = await Inventaris.findOne({ where: { inv_no } });
        if (exists)
            return response.error(res, "No inventaris sudah digunakan", 400);

        const data = await Inventaris.create({
            inv_no,
            inv_nama,
            inv_kategori,
            inv_jenis,
            inv_lokasi,
            inv_merk,
            inv_serial_number,
            inv_pic,
            inv_tgl_beli,
            inv_kondisi,
            inv_notes,
            inv_created_by: req.user.user_id,
        });
        return response.created(res, data, "Inventaris berhasil ditambahkan");
    } catch (err) {
        next(err);
    }
};

// PUT /inventaris/:id
const update = async (req, res, next) => {
    try {
        const data = await Inventaris.findByPk(req.params.id);
        if (!data)
            return response.error(res, "Inventaris tidak ditemukan", 404);

        const fields = [
            "inv_no",
            "inv_nama",
            "inv_kategori",
            "inv_jenis",
            "inv_lokasi",
            "inv_merk",
            "inv_serial_number",
            "inv_pic",
            "inv_tgl_beli",
            "inv_kondisi",
            "inv_notes",
        ];
        fields.forEach((f) => {
            if (req.body[f] !== undefined) data[f] = req.body[f];
        });
        await data.save();

        return response.ok(res, data, "Inventaris berhasil diupdate");
    } catch (err) {
        next(err);
    }
};

// PATCH /inventaris/:id/aktif
const toggleAktif = async (req, res, next) => {
    try {
        const data = await Inventaris.findByPk(req.params.id);
        if (!data)
            return response.error(res, "Inventaris tidak ditemukan", 404);
        data.inv_is_active = data.inv_is_active ? 0 : 1;
        await data.save();
        return response.ok(
            res,
            data,
            `Inventaris ${data.inv_is_active ? "diaktifkan" : "dinonaktifkan"}`,
        );
    } catch (err) {
        next(err);
    }
};

module.exports = { getAll, getOne, create, update, toggleAktif };
