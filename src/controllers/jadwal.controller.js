const {
    plan_jadwal: Jadwal,
    plan_user: User,
    plan_inventaris: Inventaris,
} = require("../models");
const { Op } = require("sequelize");
const response = require("../utils/response");

// helper: hitung week_number dari tanggal
const getWeekNumber = (dateStr) => {
    const d = new Date(dateStr);
    const startOfYear = new Date(d.getFullYear(), 0, 1);
    const diff = d - startOfYear;
    return Math.ceil((diff / 86400000 + startOfYear.getDay() + 1) / 7);
};

// GET /jadwal?status=Aktif&jenis=Sewing&assigned_to=1&tgl=2025-03-01
const getAll = async (req, res, next) => {
    try {
        const { status, jenis, assigned_to, tgl, bulan, tahun } = req.query;
        const where = {};
        if (status) where.jdw_status = status;
        if (jenis) where.jdw_inv_jenis = jenis;
        if (assigned_to) where.jdw_assigned_to = assigned_to;
        if (bulan) where.jdw_bulan = bulan;
        if (tahun) where.jdw_tahun = tahun;

        // filter jadwal yang aktif pada tanggal tertentu
        if (tgl) {
            where.jdw_tgl_mulai = { [Op.lte]: tgl };
            where[Op.or] = [
                { jdw_tgl_selesai: null },
                { jdw_tgl_selesai: { [Op.gte]: tgl } },
            ];
        }

        const data = await Jadwal.findAll({
            where,
            include: [
                {
                    model: User,
                    as: "jdw_assigned_to_plan_user",
                    attributes: ["user_id", "user_nama", "user_jabatan"],
                },
                {
                    model: User,
                    as: "jdw_dibuat_oleh_plan_user",
                    attributes: ["user_id", "user_nama"],
                },
            ],
            order: [["jdw_tgl_mulai", "DESC"]],
        });
        return response.ok(res, data);
    } catch (err) {
        next(err);
    }
};

// GET /jadwal/:id
const getOne = async (req, res, next) => {
    try {
        const data = await Jadwal.findByPk(req.params.id, {
            include: [
                {
                    model: User,
                    as: "jdw_assigned_to_plan_user",
                    attributes: ["user_id", "user_nama", "user_jabatan"],
                },
                {
                    model: User,
                    as: "jdw_dibuat_oleh_plan_user",
                    attributes: ["user_id", "user_nama"],
                },
            ],
        });
        if (!data) return response.error(res, "Jadwal tidak ditemukan", 404);

        // ambil inventaris dengan jenis yang sama
        const inventarisList = await Inventaris.findAll({
            where: { inv_jenis: data.jdw_inv_jenis, inv_is_active: 1 },
            attributes: [
                "inv_id",
                "inv_no",
                "inv_nama",
                "inv_lokasi",
                "inv_pic",
                "inv_kondisi",
            ],
            order: [["inv_nama", "ASC"]],
        });

        return response.ok(res, { jadwal: data, inventaris: inventarisList });
    } catch (err) {
        next(err);
    }
};

// POST /jadwal
const create = async (req, res, next) => {
    try {
        const {
            jdw_judul,
            jdw_inv_jenis,
            jdw_frekuensi,
            jdw_tgl_mulai,
            jdw_tgl_selesai,
            jdw_assigned_to,
            jdw_notes,
        } = req.body;

        if (!jdw_judul || !jdw_inv_jenis || !jdw_frekuensi || !jdw_tgl_mulai)
            return response.error(
                res,
                "Judul, jenis inventaris, frekuensi, dan tanggal mulai wajib diisi",
                400,
            );

        const tgl = new Date(jdw_tgl_mulai);
        const bulan = tgl.getMonth() + 1;
        const tahun = tgl.getFullYear();
        const weekNo = getWeekNumber(jdw_tgl_mulai);

        const data = await Jadwal.create({
            jdw_judul,
            jdw_inv_jenis,
            jdw_frekuensi,
            jdw_tgl_mulai,
            jdw_tgl_selesai: jdw_tgl_selesai || null,
            jdw_week_number: weekNo,
            jdw_bulan: bulan,
            jdw_tahun: tahun,
            jdw_assigned_to: jdw_assigned_to || null,
            jdw_notes: jdw_notes || null,
            jdw_status: "Draft",
            jdw_dibuat_oleh: req.user.user_id,
        });

        return response.created(res, data, "Jadwal berhasil dibuat");
    } catch (err) {
        next(err);
    }
};

// PUT /jadwal/:id
const update = async (req, res, next) => {
    try {
        const data = await Jadwal.findByPk(req.params.id);
        if (!data) return response.error(res, "Jadwal tidak ditemukan", 404);
        if (data.jdw_status === "Selesai")
            return response.error(
                res,
                "Jadwal yang sudah selesai tidak bisa diubah",
                400,
            );

        const fields = [
            "jdw_judul",
            "jdw_inv_jenis",
            "jdw_frekuensi",
            "jdw_tgl_mulai",
            "jdw_tgl_selesai",
            "jdw_assigned_to",
            "jdw_notes",
        ];
        fields.forEach((f) => {
            if (req.body[f] !== undefined) data[f] = req.body[f];
        });

        // recalculate periode jika tgl_mulai berubah
        if (req.body.jdw_tgl_mulai) {
            const tgl = new Date(req.body.jdw_tgl_mulai);
            data.jdw_bulan = tgl.getMonth() + 1;
            data.jdw_tahun = tgl.getFullYear();
            data.jdw_week_number = getWeekNumber(req.body.jdw_tgl_mulai);
        }

        await data.save();
        return response.ok(res, data, "Jadwal berhasil diupdate");
    } catch (err) {
        next(err);
    }
};

// PATCH /jadwal/:id/status  — body: { status: 'Aktif' }
const updateStatus = async (req, res, next) => {
    try {
        const { status } = req.body;
        const allowed = ["Draft", "Aktif", "Selesai", "Dibatalkan"];
        if (!allowed.includes(status))
            return response.error(res, "Status tidak valid", 400);

        const data = await Jadwal.findByPk(req.params.id);
        if (!data) return response.error(res, "Jadwal tidak ditemukan", 404);
        data.jdw_status = status;
        await data.save();
        return response.ok(res, data, `Jadwal ${status.toLowerCase()}`);
    } catch (err) {
        next(err);
    }
};

// GET /jadwal/hari-ini — jadwal aktif hari ini untuk user yang login
const hariIni = async (req, res, next) => {
    try {
        const today = new Date().toISOString().split("T")[0];
        const where = {
            jdw_status: "Aktif",
            jdw_tgl_mulai: { [Op.lte]: today },
            [Op.or]: [
                { jdw_tgl_selesai: null },
                { jdw_tgl_selesai: { [Op.gte]: today } },
            ],
        };

        // teknisi & it_support hanya lihat jadwal yang di-assign ke mereka
        if (["teknisi", "it_support"].includes(req.user.user_jabatan)) {
            where.jdw_assigned_to = req.user.user_id;
        }

        const data = await Jadwal.findAll({
            where,
            include: [
                {
                    model: User,
                    as: "assigned_user",
                    attributes: ["user_id", "user_nama", "user_jabatan"],
                },
            ],
            order: [["jdw_inv_jenis", "ASC"]],
        });
        return response.ok(res, data);
    } catch (err) {
        next(err);
    }
};

module.exports = { getAll, getOne, create, update, updateStatus, hariIni };
