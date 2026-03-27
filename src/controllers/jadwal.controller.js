const {
    plan_jadwal: Jadwal,
    plan_user: User,
    plan_inventaris: Inventaris,
    sequelize,
} = require("../models");
const UserService = require("../services/user.service");
const { Op } = require("sequelize");
const response = require("../utils/response");
const { normalizeDivisi } = require("../utils/divisi");
const { parsePagination, buildMeta } = require("../utils/pagination");

const resolveJadwalSort = (sortBy, orderBy) => {
    const allowedSort = [
        "jdw_tgl_mulai",
        "jdw_tgl_selesai",
        "jdw_created_at",
        "jdw_updated_at",
        "jdw_judul",
    ];
    const sortField = allowedSort.includes(sortBy) ? sortBy : "jdw_tgl_mulai";
    const sortOrder =
        String(orderBy || "DESC").toUpperCase() === "ASC" ? "ASC" : "DESC";
    return [[sortField, sortOrder]];
};

const serializeJadwal = (item) => {
    const plain = item.get({ plain: true });
    plain.assigned_user = plain.jdw_assigned_to_plan_user || null;
    plain.dibuat_user = plain.jdw_dibuat_oleh_plan_user || null;
    return plain;
};

const serializeInventaris = (item) => {
    const plain = item.get({ plain: true });
    plain.inv_jenis = plain.inv_jenis_id;
    return plain;
};

const jenisHasActiveInventaris = async (jenisId) => {
    const normalizedJenisId = Number(jenisId);
    if (!Number.isInteger(normalizedJenisId) || normalizedJenisId <= 0) {
        return false;
    }

    const total = await Inventaris.count({
        where: {
            inv_jenis_id: normalizedJenisId,
            inv_is_active: 1,
        },
    });

    return total > 0;
};

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
        const { status, jenis, assigned_to, tgl, bulan, tahun, divisi } =
            req.query;
        const { hasPagination, limit, offset } = parsePagination(req.query);
        const order = resolveJadwalSort(req.query.sort, req.query.order);
        const where = {};
        if (status) where.jdw_status = status;
        if (jenis) where.jdw_jenis_id = jenis;
        if (assigned_to) where.jdw_assigned_to = assigned_to;
        if (bulan) where.jdw_bulan = bulan;
        if (tahun) where.jdw_tahun = tahun;
        if (divisi) {
            const normalizedDivisi = normalizeDivisi(divisi);
            if (!normalizedDivisi)
                return response.error(res, "Divisi tidak valid", 400);
            where.jdw_divisi = normalizedDivisi;
        }

        // filter jadwal yang aktif pada tanggal tertentu
        if (tgl) {
            where[Op.and] = where[Op.and] || [];
            where[Op.and].push({ jdw_tgl_mulai: { [Op.lte]: tgl } });
            where[Op.and].push({
                [Op.or]: [
                    { jdw_tgl_selesai: null },
                    { jdw_tgl_selesai: { [Op.gte]: tgl } },
                ],
            });
        }

        const isAdmin = req.user.user_jabatan === "admin";
        const userDivisi = normalizeDivisi(req.user.user_divisi);
        if (!isAdmin) {
            where[Op.and] = where[Op.and] || [];
            where[Op.and].push({
                [Op.or]: [
                    { jdw_divisi: userDivisi || req.user.user_divisi },
                    { jdw_assigned_to: req.user.user_id },
                ],
            });
        }

        const queryOptions = {
            where,
            attributes: {
                include: [
                    [
                        sequelize.literal(`(
                            SELECT COUNT(*)
                            FROM plan_inventaris i
                            WHERE i.inv_jenis_id = plan_jadwal.jdw_jenis_id
                              AND i.inv_is_active = 1
                        )`),
                        "jdw_total_unit",
                    ],
                    [
                        sequelize.literal(`(
                            SELECT COUNT(DISTINCT r.real_inv_id)
                            FROM plan_realisasi r
                            WHERE r.real_jadwal_id = plan_jadwal.jdw_id
                              AND r.real_status = 'Selesai'
                        )`),
                        "jdw_selesai_unit",
                    ],
                ],
            },
            include: [
                {
                    model: User,
                    as: "jdw_assigned_to_plan_user",
                    attributes: [
                        "user_id",
                        "user_nama",
                        "user_jabatan",
                        "user_divisi",
                    ],
                },
                {
                    model: User,
                    as: "jdw_dibuat_oleh_plan_user",
                    attributes: ["user_id", "user_nama"],
                },
            ],
            order,
        };

        if (!hasPagination) {
            const data = await Jadwal.findAll(queryOptions);
            return response.ok(res, data.map(serializeJadwal));
        }

        const { count, rows } = await Jadwal.findAndCountAll({
            ...queryOptions,
            limit,
            offset,
            distinct: true,
            col: "jdw_id",
        });

        return response.ok(res, {
            items: rows.map(serializeJadwal),
            meta: buildMeta({
                total: count,
                limit,
                offset,
                itemCount: rows.length,
            }),
        });
    } catch (err) {
        next(err);
    }
};

const getByDivisi = async (req, res, next) => {
    try {
        const { status, jenis, tgl } = req.query;
        const { hasPagination, limit, offset } = parsePagination(req.query);
        const order = resolveJadwalSort(req.query.sort, req.query.order);
        const userDivisi = normalizeDivisi(req.user.user_divisi);
        const where = { jdw_divisi: userDivisi || req.user.user_divisi };
        if (status) where.jdw_status = status;
        if (jenis) where.jdw_jenis_id = jenis;
        if (tgl) {
            where[Op.and] = where[Op.and] || [];
            where[Op.and].push({ jdw_tgl_mulai: { [Op.lte]: tgl } });
            where[Op.and].push({
                [Op.or]: [
                    { jdw_tgl_selesai: null },
                    { jdw_tgl_selesai: { [Op.gte]: tgl } },
                ],
            });
        }

        const queryOptions = {
            where,
            attributes: {
                include: [
                    [
                        sequelize.literal(`(
                            SELECT COUNT(*)
                            FROM plan_inventaris i
                            WHERE i.inv_jenis_id = plan_jadwal.jdw_jenis_id
                              AND i.inv_is_active = 1
                        )`),
                        "jdw_total_unit",
                    ],
                    [
                        sequelize.literal(`(
                            SELECT COUNT(DISTINCT r.real_inv_id)
                            FROM plan_realisasi r
                            WHERE r.real_jadwal_id = plan_jadwal.jdw_id
                              AND r.real_status = 'Selesai'
                        )`),
                        "jdw_selesai_unit",
                    ],
                ],
            },
            include: [
                {
                    model: User,
                    as: "jdw_assigned_to_plan_user",
                    attributes: [
                        "user_id",
                        "user_nama",
                        "user_jabatan",
                        "user_divisi",
                    ],
                },
                {
                    model: User,
                    as: "jdw_dibuat_oleh_plan_user",
                    attributes: ["user_id", "user_nama"],
                },
            ],
            order,
        };

        if (!hasPagination) {
            const data = await Jadwal.findAll(queryOptions);
            return response.ok(res, data.map(serializeJadwal));
        }

        const { count, rows } = await Jadwal.findAndCountAll({
            ...queryOptions,
            limit,
            offset,
            distinct: true,
            col: "jdw_id",
        });

        return response.ok(res, {
            items: rows.map(serializeJadwal),
            meta: buildMeta({
                total: count,
                limit,
                offset,
                itemCount: rows.length,
            }),
        });
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
                    attributes: [
                        "user_id",
                        "user_nama",
                        "user_jabatan",
                        "user_divisi",
                    ],
                },
                {
                    model: User,
                    as: "jdw_dibuat_oleh_plan_user",
                    attributes: ["user_id", "user_nama"],
                },
            ],
        });
        if (!data) return response.error(res, "Jadwal tidak ditemukan", 404);

        const isAdmin = req.user.user_jabatan === "admin";
        const userDivisi = normalizeDivisi(req.user.user_divisi);
        if (
            !isAdmin &&
            data.jdw_divisi !== (userDivisi || req.user.user_divisi) &&
            data.jdw_assigned_to !== req.user.user_id
        ) {
            return response.error(res, "Akses jadwal ditolak", 403);
        }

        // ambil inventaris dengan jenis yang sama
        const inventarisList = await Inventaris.findAll({
            where: { inv_jenis_id: data.jdw_jenis_id, inv_is_active: 1 },
            attributes: [
                "inv_id",
                "inv_no",
                "inv_nama",
                "inv_jenis_id",
                "inv_lokasi",
                "inv_pic",
                "inv_kondisi",
            ],
            include: [
                {
                    model: User,
                    as: "pic_user",
                    attributes: ["user_id", "user_nama", "user_jabatan"],
                },
            ],
            order: [["inv_nama", "ASC"]],
        });

        return response.ok(res, {
            jadwal: serializeJadwal(data),
            inventaris: inventarisList.map(serializeInventaris),
        });
    } catch (err) {
        next(err);
    }
};

// POST /jadwal
const create = async (req, res, next) => {
    try {
        const {
            jdw_judul,
            jdw_jenis_id,
            jdw_divisi,
            jdw_frekuensi,
            jdw_tgl_mulai,
            jdw_tgl_selesai,
            jdw_assigned_to,
            jdw_notes,
        } = req.body;
        const normalizedDivisi = normalizeDivisi(jdw_divisi);

        if (
            !jdw_judul ||
            !jdw_jenis_id ||
            !jdw_divisi ||
            !jdw_frekuensi ||
            !jdw_tgl_mulai
        )
            return response.error(
                res,
                "Judul, jenis inventaris, divisi, frekuensi, dan tanggal mulai wajib diisi",
                400,
            );
        if (!normalizedDivisi)
            return response.error(res, "Divisi tidak valid", 400);

        const hasInventaris = await jenisHasActiveInventaris(jdw_jenis_id);
        if (!hasInventaris) {
            return response.error(
                res,
                "Jenis inventaris belum memiliki unit inventaris aktif",
                400,
            );
        }

        const tgl = new Date(jdw_tgl_mulai);
        const bulan = tgl.getMonth() + 1;
        const tahun = tgl.getFullYear();
        const weekNo = getWeekNumber(jdw_tgl_mulai);

        const data = await Jadwal.create({
            jdw_judul,
            jdw_jenis_id,
            jdw_divisi: normalizedDivisi,
            jdw_frekuensi,
            jdw_tgl_mulai,
            jdw_tgl_selesai: jdw_tgl_selesai || null,
            jdw_week_number: weekNo,
            jdw_bulan: bulan,
            jdw_tahun: tahun,
            jdw_assigned_to: jdw_assigned_to || null,
            jdw_notes: jdw_notes || null,
            jdw_status: "Aktif",
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
        const fields = [
            "jdw_judul",
            "jdw_jenis_id",
            "jdw_frekuensi",
            "jdw_divisi",
            "jdw_tgl_mulai",
            "jdw_tgl_selesai",
            "jdw_assigned_to",
            "jdw_notes",
        ];
        fields.forEach((f) => {
            if (req.body[f] !== undefined) data[f] = req.body[f];
        });
        if (req.body.jdw_divisi !== undefined) {
            const normalizedDivisi = normalizeDivisi(req.body.jdw_divisi);
            if (!normalizedDivisi)
                return response.error(res, "Divisi tidak valid", 400);
            data.jdw_divisi = normalizedDivisi;
        }

        if (req.body.jdw_jenis_id !== undefined) {
            const hasInventaris = await jenisHasActiveInventaris(
                req.body.jdw_jenis_id,
            );
            if (!hasInventaris) {
                return response.error(
                    res,
                    "Jenis inventaris belum memiliki unit inventaris aktif",
                    400,
                );
            }
        }

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

// PATCH /jadwal/:id/status  — body: { status: 'Aktif' | 'Nonaktif' }
const updateStatus = async (req, res, next) => {
    try {
        const { status } = req.body;
        const allowed = ["Aktif", "Nonaktif"];
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
        const now = new Date();
        const today = now.toISOString().split("T")[0];
        const todayDay = now.getDay();
        const todayDate = now.getDate();
        const frekuensiHariIni = [{ jdw_frekuensi: "Harian" }];
        if (todayDay === 1)
            frekuensiHariIni.push({ jdw_frekuensi: "Mingguan" });
        if (todayDate === 1)
            frekuensiHariIni.push({ jdw_frekuensi: "Bulanan" });

        const where = {
            jdw_status: "Aktif",
            jdw_tgl_mulai: { [Op.lte]: today },
            [Op.or]: [
                { jdw_tgl_selesai: null },
                { jdw_tgl_selesai: { [Op.gte]: today } },
            ],
            [Op.and]: [{ [Op.or]: frekuensiHariIni }],
            jdw_divisi:
                normalizeDivisi(req.user.user_divisi) || req.user.user_divisi,
        };

        const isAdmin = req.user.user_jabatan === "admin";
        if (isAdmin) delete where.jdw_divisi;

        const data = await Jadwal.findAll({
            where,
            include: [
                {
                    model: User,
                    as: "jdw_assigned_to_plan_user",
                    attributes: ["user_id", "user_nama", "user_jabatan"],
                },
            ],
            order: [["jdw_tgl_mulai", "ASC"]],
        });
        return response.ok(res, data.map(serializeJadwal));
    } catch (err) {
        next(err);
    }
};

module.exports = {
    getAll,
    getByDivisi,
    getOne,
    create,
    update,
    updateStatus,
    hariIni,
};
