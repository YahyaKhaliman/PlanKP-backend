const fs = require("fs");
const path = require("path");
const {
    plan_realisasi: Realisasi,
    plan_hasil_checklist: HasilChecklist,
    plan_jadwal: Jadwal,
    plan_inventaris: Inventaris,
    plan_checklist_template: ChecklistTemplate,
    plan_jenis: Jenis,
    plan_user: User,
    sequelize,
} = require("../models");
const { Op, QueryTypes } = require("sequelize");
const response = require("../utils/response");
const { normalizeDivisi } = require("../utils/divisi");
const { parsePagination, buildMeta } = require("../utils/pagination");
const {
    getWeekNumber: getWeekNumberUtil,
    getMonthNumber,
    getYear,
} = require("../utils/date-helper");

const isAdminUser = (req) =>
    String(req.user?.user_jabatan || "").toLowerCase() === "admin";

const isManagerUser = (req) =>
    String(req.user?.user_jabatan || "").toLowerCase() === "manager";

const isSelfOnlyRealisasiRole = (req) => {
    const role = String(req.user?.user_jabatan || "").toLowerCase();
    return ["user", "teknisi", "it_support"].includes(role);
};

const splitPabrikCodes = (value) => {
    if (!value) return [];
    const raw = Array.isArray(value) ? value : String(value).split(",");
    return raw
        .map((code) => String(code).trim())
        .filter((code) => code.length > 0);
};

const normalizeDateOnly = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    date.setHours(0, 0, 0, 0);
    return date;
};

const addDays = (date, days) => {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
};

const formatDateOnly = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
};

const resolveRealisasiSort = (sortBy, orderBy) => {
    const allowedSort = [
        "real_tgl",
        "real_created_at",
        "real_updated_at",
        "real_status",
    ];
    const sortField = allowedSort.includes(sortBy) ? sortBy : "real_tgl";
    const sortOrder =
        String(orderBy || "DESC").toUpperCase() === "ASC" ? "ASC" : "DESC";
    return [[sortField, sortOrder]];
};

const serializeChecklist = (item) => {
    const plain = item.get({ plain: true });
    plain.template_item = plain.hc_ct || null;
    return plain;
};

const serializeRealisasi = (item) => {
    const plain = item.get({ plain: true });
    plain.jadwal = plain.real_jadwal || null;
    plain.inventaris = plain.real_inv || null;
    plain.teknisi = plain.real_teknisi || null;
    if (Array.isArray(plain.plan_hasil_checklists)) {
        plain.hasil_checklist = plain.plan_hasil_checklists
            .map(serializeChecklist)
            .sort((left, right) => left.hc_ct_id - right.hc_ct_id);
    }
    return plain;
};

const getAll = async (req, res, next) => {
    try {
        const { jadwal_id, status, bulan, tahun, teknisi_id, by_divisi } =
            req.query;
        const { hasPagination, limit, offset } = parsePagination(req.query);
        const order = resolveRealisasiSort(req.query.sort, req.query.order);
        const where = {};
        const includeJadwal = {
            model: Jadwal,
            as: "real_jadwal",
            attributes: [
                "jdw_id",
                "jdw_judul",
                "jdw_frekuensi",
                "jdw_divisi",
                "jdw_status",
                "jdw_target",
                "jdw_week_number",
                "jdw_bulan",
                "jdw_tahun",
            ],
        };
        if (jadwal_id) where.real_jadwal_id = jadwal_id;
        if (status) where.real_status = status;
        if (bulan) where.real_bulan = bulan;
        if (tahun) where.real_tahun = tahun;
        if (teknisi_id) where.real_teknisi_id = teknisi_id;

        const isAdmin = isAdminUser(req);
        const isManager = isManagerUser(req);
        const isSelfOnly = isSelfOnlyRealisasiRole(req);
        const userDivisi =
            normalizeDivisi(req.user.user_divisi) || req.user.user_divisi;

        if (isSelfOnly) {
            where.real_teknisi_id = req.user.user_id;
        } else if (!isAdmin && !isManager) {
            includeJadwal.where = { jdw_divisi: userDivisi };
        }

        const queryOptions = {
            where,
            include: [
                includeJadwal,
                {
                    model: Inventaris,
                    as: "real_inv",
                    attributes: [
                        "inv_id",
                        "inv_no",
                        "inv_nama",
                        "inv_pabrik_kode",
                        "inv_pic",
                    ],
                },
                {
                    model: User,
                    as: "real_teknisi",
                    attributes: ["user_id", "user_nama"],
                    ...(isAdmin || isManager
                        ? {
                              where: {
                                  ...(isAdmin
                                      ? { user_divisi: userDivisi }
                                      : {}),
                                  user_jabatan: {
                                      [Op.in]: [
                                          "user",
                                          "teknisi",
                                          "it_support",
                                      ],
                                  },
                              },
                          }
                        : {}),
                },
            ],
            order,
        };

        if (!hasPagination) {
            const data = await Realisasi.findAll(queryOptions);
            return response.okList(res, data.map(serializeRealisasi), {
                total: data.length,
                itemCount: data.length,
            });
        }

        const { count, rows } = await Realisasi.findAndCountAll({
            ...queryOptions,
            limit,
            offset,
            distinct: true,
            col: "real_id",
        });

        return response.okList(
            res,
            rows.map(serializeRealisasi),
            buildMeta({
                total: count,
                limit,
                offset,
                itemCount: rows.length,
            }),
        );
    } catch (err) {
        next(err);
    }
};

// GET /realisasi/:id  — detail lengkap dengan hasil checklist
const getOne = async (req, res, next) => {
    try {
        const rows = await sequelize.query(
            `
            SELECT
                r.real_id,
                r.real_jadwal_id,
                r.real_inv_id,
                r.real_teknisi_id,
                r.real_tgl,
                r.real_jam_mulai,
                r.real_jam_selesai,
                r.real_week_number,
                r.real_bulan,
                r.real_tahun,
                r.real_kondisi_akhir,
                r.real_keterangan,
                r.real_status,
                r.real_ttd_pic_nama,
                r.real_ttd_data,
                r.real_ttd_at,
                r.real_approved_at,
                r.real_foto,
                v.jdw_judul,
                v.jdw_frekuensi,
                v.jdw_divisi,
                v.jdw_jenis_nama,
                v.jdw_jenis_kategori,
                v.inv_no,
                v.inv_nama,
                v.inv_pic,
                v.inv_kondisi_awal,
                v.inv_pabrik_kode,
                v.teknisi_nama,
                v.teknisi_divisi,
                v.approver_nama
            FROM plan_realisasi r
            LEFT JOIN v_realisasi_detail v ON v.real_id = r.real_id
            WHERE r.real_id = :realId
            LIMIT 1
            `,
            {
                replacements: { realId: req.params.id },
                type: QueryTypes.SELECT,
            },
        );

        const row = rows[0];
        if (!row) return response.error(res, "Realisasi tidak ditemukan", 404);

        const isAdmin = isAdminUser(req);
        const isManager = isManagerUser(req);
        const selfOnlyScope =
            !isAdmin && !isManager && isSelfOnlyRealisasiRole(req);
        const userDivisi =
            normalizeDivisi(req.user.user_divisi) || req.user.user_divisi;
        if (selfOnlyScope) {
            if (Number(row.real_teknisi_id) !== Number(req.user.user_id)) {
                return response.error(
                    res,
                    "Akses detail realisasi ditolak",
                    403,
                );
            }
        } else if (isAdmin || isManager) {
            const teknisi = await User.findByPk(row.real_teknisi_id, {
                attributes: ["user_id", "user_divisi", "user_jabatan"],
            });
            const teknisiDivisi = teknisi
                ? normalizeDivisi(teknisi.user_divisi) || teknisi.user_divisi
                : row.teknisi_divisi;
            const teknisiJabatan = String(
                teknisi?.user_jabatan || "",
            ).toLowerCase();

            const allowedRoles = ["user", "teknisi", "it_support"];
            if (!allowedRoles.includes(teknisiJabatan)) {
                return response.error(
                    res,
                    "Akses detail realisasi ditolak",
                    403,
                );
            }

            if (isAdmin && teknisiDivisi && teknisiDivisi !== userDivisi) {
                return response.error(
                    res,
                    "Akses detail realisasi ditolak",
                    403,
                );
            }
        } else if (!isAdmin && !isManager) {
            if (row.jdw_divisi && row.jdw_divisi !== userDivisi) {
                return response.error(
                    res,
                    "Akses detail realisasi ditolak",
                    403,
                );
            }
        }

        const checklistRows = await HasilChecklist.findAll({
            where: { hc_real_id: req.params.id },
            include: [
                {
                    model: ChecklistTemplate,
                    as: "hc_ct",
                    attributes: [
                        "ct_id",
                        "ct_item",
                        "ct_keterangan",
                        "ct_urutan",
                    ],
                },
            ],
            order: [
                [{ model: ChecklistTemplate, as: "hc_ct" }, "ct_urutan", "ASC"],
            ],
        });

        const payload = {
            real_id: row.real_id,
            real_jadwal_id: row.real_jadwal_id,
            real_inv_id: row.real_inv_id,
            real_teknisi_id: row.real_teknisi_id,
            real_tgl: row.real_tgl,
            real_jam_mulai: row.real_jam_mulai,
            real_jam_selesai: row.real_jam_selesai,
            real_week_number: row.real_week_number,
            real_bulan: row.real_bulan,
            real_tahun: row.real_tahun,
            real_kondisi_akhir: row.real_kondisi_akhir,
            real_keterangan: row.real_keterangan,
            real_status: row.real_status,
            real_ttd_pic_nama: row.real_ttd_pic_nama,
            real_ttd_data: row.real_ttd_data,
            real_ttd_at: row.real_ttd_at,
            real_approved_at: row.real_approved_at,
            real_foto: row.real_foto
                ? `${req.protocol}://${req.get("host")}/public/image/realisasi/${row.real_foto}`
                : null,
            jadwal: {
                jdw_id: row.real_jadwal_id,
                jdw_judul: row.jdw_judul,
                jdw_frekuensi: row.jdw_frekuensi,
                jdw_divisi: row.jdw_divisi,
                jdw_jenis_nama: row.jdw_jenis_nama,
                jdw_jenis_kategori: row.jdw_jenis_kategori,
            },
            inventaris: {
                inv_id: row.real_inv_id,
                inv_no: row.inv_no,
                inv_nama: row.inv_nama,
                inv_pic: row.inv_pic,
                inv_kondisi_awal: row.inv_kondisi_awal,
                inv_pabrik_kode: row.inv_pabrik_kode,
            },
            teknisi: {
                user_id: row.real_teknisi_id,
                user_nama: row.teknisi_nama,
                user_divisi: row.teknisi_divisi,
            },
            approver_nama: row.approver_nama,
            hasil_checklist: checklistRows.map(serializeChecklist),
        };

        return response.ok(res, payload);
    } catch (err) {
        next(err);
    }
};

// Helper function untuk validasi kelayakan realisasi
const validateRealisasiEligibility = async (
    real_jadwal_id,
    real_inv_id,
    real_tgl,
) => {
    if (!real_jadwal_id || !real_inv_id || !real_tgl)
        return {
            error: "Jadwal, inventaris, dan tanggal wajib diisi",
            status: 400,
        };

    const tgl = new Date(real_tgl);
    if (Number.isNaN(tgl.getTime())) {
        return { error: "Format tanggal realisasi tidak valid", status: 400 };
    }
    const bulan = getMonthNumber(tgl);
    const tahun = getYear(tgl);
    const weekNo = getWeekNumberUtil(tgl);

    const jadwal = await Jadwal.findByPk(real_jadwal_id, {
        attributes: [
            "jdw_id",
            "jdw_frekuensi",
            "jdw_gap_hari",
            "jdw_week_number",
            "jdw_bulan",
            "jdw_tahun",
            "jdw_tgl_mulai",
            "jdw_tgl_selesai",
            "jdw_jenis_id",
            "jdw_pabrik_kode",
            "jdw_status",
        ],
    });
    if (!jadwal) return { error: "Jadwal tidak ditemukan", status: 404 };

    if (jadwal.jdw_status !== "Draft") {
        return {
            error: "Jadwal harus berstatus Draft untuk realisasi",
            status: 400,
        };
    }

    const realDate = new Date(real_tgl);
    const startDate = new Date(jadwal.jdw_tgl_mulai);
    const endDate = jadwal.jdw_tgl_selesai
        ? new Date(jadwal.jdw_tgl_selesai)
        : null;
    if (
        Number.isNaN(startDate.getTime()) ||
        (endDate && Number.isNaN(endDate.getTime()))
    ) {
        return {
            error: "Periode jadwal tidak valid, hubungi admin",
            status: 400,
        };
    }

    realDate.setHours(0, 0, 0, 0);
    startDate.setHours(0, 0, 0, 0);
    if (endDate) endDate.setHours(0, 0, 0, 0);

    if (realDate < startDate) {
        return {
            error: "Tanggal realisasi belum masuk periode jadwal",
            status: 400,
        };
    }
    if (endDate && realDate > endDate) {
        return {
            error: "Tanggal realisasi melewati tanggal selesai jadwal",
            status: 400,
        };
    }

    const inventaris = await Inventaris.findOne({
        where: {
            inv_id: real_inv_id,
            inv_is_active: 1,
        },
        attributes: ["inv_id", "inv_jenis_id", "inv_pabrik_kode"],
    });
    if (!inventaris) {
        return {
            error: "Inventaris tidak ditemukan atau tidak aktif",
            status: 404,
        };
    }

    if (Number(inventaris.inv_jenis_id) !== Number(jadwal.jdw_jenis_id)) {
        return {
            error: "Inventaris tidak sesuai dengan jenis pada jadwal",
            status: 400,
        };
    }

    const jenis = await Jenis.findByPk(jadwal.jdw_jenis_id, {
        attributes: ["jenis_id", "jenis_gap_hari"],
    });
    // Gap level JENIS (per unit inventaris): mencegah unit yang sama di-service
    // terlalu sering, terlepas dari jadwal mana.
    // Contoh: jenis_gap_hari=7 berarti setelah unit X di-service,
    // harus menunggu 7 hari sebelum unit X bisa di-service lagi.
    const gapHari = Number(jenis?.jenis_gap_hari || 0);
    if (gapHari > 0) {
        const lastSelesai = await Realisasi.findOne({
            where: {
                real_inv_id: real_inv_id,
                real_status: "Selesai",
            },
            attributes: ["real_tgl"],
            order: [["real_tgl", "DESC"]],
        });

        if (lastSelesai?.real_tgl) {
            const lastDate = normalizeDateOnly(lastSelesai.real_tgl);
            const currentDate = normalizeDateOnly(real_tgl);
            if (lastDate && currentDate) {
                const nextEligibleDate = addDays(lastDate, gapHari);
                if (currentDate < nextEligibleDate) {
                    return {
                        error: `Inventaris belum melewati gap realisasi ${gapHari} hari. Bisa direalisasikan lagi pada ${formatDateOnly(nextEligibleDate)}`,
                        status: 400,
                    };
                }
            }
        }
    }

    // Gap level JADWAL (per jadwal, bukan per inventaris):
    // Mencegah realisasi pada jadwal ini terlalu sering,
    // terlepas dari unit inventaris mana yang dikerjakan.
    const jadwalGapHari = Number(jadwal.jdw_gap_hari || 0);
    if (
        ["Mingguan", "Bulanan"].includes(jadwal.jdw_frekuensi) &&
        jadwalGapHari > 0
    ) {
        const lastSelesaiJadwal = await Realisasi.findOne({
            where: {
                real_jadwal_id,
                real_status: "Selesai",
            },
            attributes: ["real_tgl"],
            order: [["real_tgl", "DESC"]],
        });

        if (lastSelesaiJadwal?.real_tgl) {
            const lastDate = normalizeDateOnly(lastSelesaiJadwal.real_tgl);
            const currentDate = normalizeDateOnly(real_tgl);
            if (lastDate && currentDate) {
                const nextEligibleDate = addDays(lastDate, jadwalGapHari);
                if (currentDate < nextEligibleDate) {
                    return {
                        error: `Jadwal ini memiliki gap realisasi ${jadwalGapHari} hari. Realisasi berikutnya dapat dilakukan pada ${formatDateOnly(nextEligibleDate)}`,
                        status: 400,
                    };
                }
            }
        }
    }

    const allowedPabrikCodes = splitPabrikCodes(jadwal.jdw_pabrik_kode);
    if (
        allowedPabrikCodes.length > 0 &&
        !allowedPabrikCodes.includes(String(inventaris.inv_pabrik_kode))
    ) {
        return {
            error: "Inventaris tidak termasuk pabrik/lokasi jadwal",
            status: 400,
        };
    }

    const duplicateWhere = {
        real_jadwal_id,
        real_inv_id,
    };

    if (jadwal.jdw_frekuensi === "Mingguan") {
        duplicateWhere.real_week_number = weekNo;
        duplicateWhere.real_tahun = tahun;
    } else if (jadwal.jdw_frekuensi === "Bulanan") {
        duplicateWhere.real_bulan = bulan;
        duplicateWhere.real_tahun = tahun;
    } else {
        duplicateWhere.real_tgl = real_tgl;
    }

    const existingRealisasi = await Realisasi.findOne({
        where: duplicateWhere,
        attributes: ["real_id"],
    });

    if (existingRealisasi) {
        const periodStr =
            jadwal.jdw_frekuensi === "Mingguan"
                ? "minggu"
                : jadwal.jdw_frekuensi === "Bulanan"
                  ? "bulan"
                  : "tanggal";
        return {
            error: `Realisasi untuk jadwal dan inventaris ini pada ${periodStr} yang sama sudah ada`,
            status: 409,
        };
    }

    return { success: true, weekNo, bulan, tahun };
};

// POST /realisasi/check-eligibility — cek kelayakan sebelum mengisi checklist
const checkEligibility = async (req, res, next) => {
    try {
        const { real_jadwal_id, real_inv_id, real_tgl } = req.body;

        // Default ke hari ini jika real_tgl tidak dikirim dari frontend
        const tgl = real_tgl || new Date().toISOString().split("T")[0];

        const valid = await validateRealisasiEligibility(
            real_jadwal_id,
            real_inv_id,
            tgl,
        );
        if (valid.error) {
            return response.error(res, valid.error, valid.status);
        }

        return response.ok(res, { eligible: true });
    } catch (err) {
        next(err);
    }
};

// POST /realisasi — buat realisasi baru (status Draft)
const create = async (req, res, next) => {
    try {
        const {
            real_jadwal_id,
            real_inv_id,
            real_tgl,
            real_jam_mulai,
            real_jam_selesai,
            real_kondisi_akhir,
            real_keterangan,
        } = req.body;

        const valid = await validateRealisasiEligibility(
            real_jadwal_id,
            real_inv_id,
            real_tgl,
        );
        if (valid.error) {
            return response.error(res, valid.error, valid.status);
        }

        const payload = {
            real_jadwal_id,
            real_inv_id,
            real_teknisi_id: req.user.user_id,
            real_tgl,
            real_jam_mulai,
            real_jam_selesai,
            real_week_number: valid.weekNo,
            real_bulan: valid.bulan,
            real_tahun: valid.tahun,
            real_kondisi_akhir,
            real_keterangan,
            real_status: "Draft",
        };
        const data = await Realisasi.create(payload);

        return response.created(res, data, "Realisasi berhasil dibuat");
    } catch (err) {
        next(err);
    }
};

// POST /realisasi/:id/checklist — simpan/update hasil checklist
const saveChecklist = async (req, res, next) => {
    const t = await sequelize.transaction();
    try {
        const { hasil } = req.body;
        // hasil: [{ hc_ct_id, hc_hasil, hc_kondisi, hc_keterangan }]
        if (!Array.isArray(hasil) || hasil.length === 0)
            return response.error(res, "Data hasil checklist wajib diisi", 400);

        const real = await Realisasi.findByPk(req.params.id, {
            transaction: t,
        });
        if (!real) return response.error(res, "Realisasi tidak ditemukan", 404);
        if (
            !isAdminUser(req) &&
            isSelfOnlyRealisasiRole(req) &&
            Number(real.real_teknisi_id) !== Number(req.user.user_id)
        ) {
            return response.error(
                res,
                "Akses checklist realisasi ditolak",
                403,
            );
        }
        if (real.real_status === "Selesai")
            return response.error(res, "Realisasi sudah selesai", 400);

        // hapus hasil lama lalu insert baru
        await HasilChecklist.destroy({
            where: { hc_real_id: req.params.id },
            transaction: t,
        });

        await HasilChecklist.bulkCreate(
            hasil.map((h) => ({
                hc_real_id: req.params.id,
                hc_ct_id: h.hc_ct_id,
                hc_hasil: h.hc_hasil,
                hc_kondisi: h.hc_kondisi || null,
                hc_keterangan: h.hc_keterangan || null,
            })),
            { transaction: t },
        );

        await t.commit();
        return response.ok(res, null, "Hasil checklist berhasil disimpan");
    } catch (err) {
        await t.rollback();
        next(err);
    }
};

// POST /realisasi/:id/ttd — simpan TTD + nama PIC, status → Selesai
const saveTtd = async (req, res, next) => {
    const t = await sequelize.transaction();
    try {
        const { real_ttd_pic_nama, real_ttd_data } = req.body;
        if (!real_ttd_pic_nama || !real_ttd_data)
            return response.error(
                res,
                "Nama PIC dan data TTD wajib diisi",
                400,
            );

        const real = await Realisasi.findByPk(req.params.id, {
            transaction: t,
        });
        if (!real) return response.error(res, "Realisasi tidak ditemukan", 404);
        if (
            !isAdminUser(req) &&
            isSelfOnlyRealisasiRole(req) &&
            Number(real.real_teknisi_id) !== Number(req.user.user_id)
        ) {
            return response.error(res, "Akses realisasi ditolak", 403);
        }
        if (real.real_status === "Selesai")
            return response.error(res, "Realisasi sudah selesai", 400);

        // validasi: harus ada minimal 1 hasil checklist
        const totalHasil = await HasilChecklist.count({
            where: { hc_real_id: req.params.id },
            transaction: t,
        });
        if (totalHasil === 0)
            return response.error(
                res,
                "Isi checklist terlebih dahulu sebelum TTD",
                400,
            );

        real.real_ttd_pic_nama = real_ttd_pic_nama;
        real.real_ttd_data = real_ttd_data;
        real.real_ttd_at = new Date();
        real.real_jam_selesai = new Date().toTimeString().split(" ")[0];
        real.real_approved_at = new Date();
        real.real_status = "Selesai";
        await real.save({ transaction: t });

        await t.commit();
        return response.ok(res, null, "Realisasi selesai dan TTD tersimpan");
    } catch (err) {
        await t.rollback();
        next(err);
    }
};

// GET /realisasi/template/:inv_jenis — ambil template checklist untuk jenis ini
const getTemplate = async (req, res, next) => {
    try {
        const data = await ChecklistTemplate.findAll({
            where: { ct_jenis_id: req.params.inv_jenis, ct_is_active: 1 },
            order: [["ct_urutan", "ASC"]],
        });
        return response.ok(res, data);
    } catch (err) {
        next(err);
    }
};

// PUT /realisasi/:id — update field realisasi sebelum TTD (hanya saat Draft)
const update = async (req, res, next) => {
    try {
        const real = await Realisasi.findByPk(req.params.id);
        if (!real) return response.error(res, "Realisasi tidak ditemukan", 404);
        if (
            !isAdminUser(req) &&
            isSelfOnlyRealisasiRole(req) &&
            Number(real.real_teknisi_id) !== Number(req.user.user_id)
        ) {
            return response.error(res, "Akses update realisasi ditolak", 403);
        }
        if (real.real_status !== "Draft")
            return response.error(
                res,
                "Hanya realisasi Draft yang bisa diubah",
                400,
            );

        const fields = [
            "real_jam_mulai",
            "real_jam_selesai",
            "real_kondisi_akhir",
            "real_keterangan",
            "real_foto",
        ];
        fields.forEach((f) => {
            if (req.body[f] !== undefined) real[f] = req.body[f];
        });

        await real.save();
        return response.ok(res, real, "Realisasi berhasil diupdate");
    } catch (err) {
        next(err);
    }
};

// POST /realisasi/:id/foto — upload foto kendala/bukti realisasi
const uploadFoto = async (req, res, next) => {
    try {
        if (!req.file) {
            return response.error(res, "File foto wajib diunggah", 400);
        }

        const real = await Realisasi.findByPk(req.params.id);
        if (!real) {
            const newFilePath = path.join(
                __dirname,
                "../../public/image/realisasi",
                req.file.filename,
            );
            if (fs.existsSync(newFilePath)) {
                fs.unlinkSync(newFilePath);
            }
            return response.error(res, "Realisasi tidak ditemukan", 404);
        }

        if (
            !isAdminUser(req) &&
            isSelfOnlyRealisasiRole(req) &&
            Number(real.real_teknisi_id) !== Number(req.user.user_id)
        ) {
            const newFilePath = path.join(
                __dirname,
                "../../public/image/realisasi",
                req.file.filename,
            );
            if (fs.existsSync(newFilePath)) {
                fs.unlinkSync(newFilePath);
            }
            return response.error(res, "Akses upload foto ditolak", 403);
        }

        if (real.real_status === "Selesai") {
            const newFilePath = path.join(
                __dirname,
                "../../public/image/realisasi",
                req.file.filename,
            );
            if (fs.existsSync(newFilePath)) {
                fs.unlinkSync(newFilePath);
            }
            return response.error(
                res,
                "Realisasi sudah selesai, foto tidak dapat diubah lagi",
                400,
            );
        }

        // Hapus foto lama jika ada
        if (real.real_foto) {
            const oldFilePath = path.join(
                __dirname,
                "../../public/image/realisasi",
                real.real_foto,
            );
            if (fs.existsSync(oldFilePath)) {
                try {
                    fs.unlinkSync(oldFilePath);
                } catch (e) {
                    console.error("Gagal menghapus file lama:", e.message);
                }
            }
        }

        // Simpan nama file ke database
        real.real_foto = req.file.filename;
        await real.save();

        const fileUrl = `${req.protocol}://${req.get("host")}/public/image/realisasi/${req.file.filename}`;
        return response.ok(
            res,
            { real_foto: fileUrl },
            "Foto realisasi berhasil diunggah",
        );
    } catch (err) {
        if (req.file) {
            const newFilePath = path.join(
                __dirname,
                "../../public/image/realisasi",
                req.file.filename,
            );
            if (fs.existsSync(newFilePath)) {
                fs.unlinkSync(newFilePath);
            }
        }
        next(err);
    }
};

module.exports = {
    getAll,
    getOne,
    checkEligibility,
    create,
    update,
    saveChecklist,
    saveTtd,
    getTemplate,
    uploadFoto,
};
