const fs = require("fs");
const path = require("path");
const ExcelJS = require("exceljs");
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
const { compressImageToTargetSize } = require("../utils/imageCompressor");
const {
    getEffectiveScheduleDatesInMonth,
    getHolidaysForMonth,
} = require("./system.controller");

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
        .map((code) => String(code).trim().toUpperCase())
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

const formatDateDisplay = (date) => {
    if (!date) return "";
    const d = String(date.getDate()).padStart(2, "0");
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const y = date.getFullYear();
    return `${d}-${m}-${y}`;
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
    if (!item) return null;
    const plain =
        typeof item.get === "function"
            ? item.get({ plain: true })
            : { ...item };
    plain.template_item = plain.hc_ct || null;
    return plain;
};

const serializeRealisasi = (item, req) => {
    if (!item) return null;
    const plain =
        typeof item.get === "function"
            ? item.get({ plain: true })
            : { ...item };
    plain.jadwal = plain.real_jadwal || null;
    plain.inventaris = plain.real_inv || null;
    plain.teknisi = plain.real_teknisi || null;
    if (Array.isArray(plain.plan_hasil_checklists)) {
        plain.hasil_checklist = plain.plan_hasil_checklists
            .map(serializeChecklist)
            .filter((c) => c !== null)
            .sort(
                (left, right) => (left.hc_ct_id || 0) - (right.hc_ct_id || 0),
            );
    }
    if (plain.real_foto && typeof plain.real_foto === "string") {
        const raw = plain.real_foto.trim();
        if (raw && !raw.startsWith("http://") && !raw.startsWith("https://")) {
            const host = req ? `${req.protocol}://${req.get("host")}` : "";
            const cleanPath = raw.startsWith("/") ? raw : `/public/image/realisasi/${raw}`;
            plain.real_foto = host ? `${host}${cleanPath}` : cleanPath;
        }
    }
    return plain;
};

const getAll = async (req, res, next) => {
    try {
        const {
            jadwal_id,
            inv_id,
            status,
            bulan,
            tahun,
            teknisi_id,
            by_divisi,
            divisi,
        } = req.query;
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
        if (inv_id) where.real_inv_id = inv_id;
        if (status) where.real_status = status;
        if (bulan) where.real_bulan = bulan;
        if (tahun) where.real_tahun = tahun;
        if (teknisi_id) where.real_teknisi_id = teknisi_id;

        const isAdmin = isAdminUser(req);
        const isManager = isManagerUser(req);
        const isSelfOnly = isSelfOnlyRealisasiRole(req);
        const userDivisi =
            normalizeDivisi(req.user.user_divisi) || req.user.user_divisi;

        if (isSelfOnly && !jadwal_id) {
            where.real_teknisi_id = req.user.user_id;
        }

        let targetDivisi = null;
        if (
            divisi &&
            String(divisi).toLowerCase() !== "true" &&
            String(divisi).toLowerCase() !== "false"
        ) {
            targetDivisi = divisi;
        } else if (by_divisi) {
            if (String(by_divisi).toLowerCase() === "true") {
                targetDivisi = userDivisi;
            } else if (String(by_divisi).toLowerCase() !== "false") {
                targetDivisi = by_divisi;
            }
        } else if (!isManager) {
            targetDivisi = userDivisi;
        }

        if (targetDivisi) {
            includeJadwal.where = { jdw_divisi: targetDivisi };
        }

        const excludeAttrs =
            String(req.query.include_ttd).toLowerCase() === "true"
                ? []
                : ["real_ttd_data"];

        const includes = [
            includeJadwal,
            {
                model: Inventaris,
                as: "real_inv",
                attributes: [
                    "inv_id",
                    "inv_no",
                    "inv_nama",
                    "inv_serial_number",
                    "inv_pabrik_kode",
                    "inv_pic",
                ],
            },
            {
                model: User,
                as: "real_teknisi",
                attributes: [
                    "user_id",
                    "user_nama",
                    "user_divisi",
                    "user_jabatan",
                ],
            },
        ];

        if (String(req.query.include_checklist).toLowerCase() === "true") {
            includes.push({
                model: HasilChecklist,
                as: "plan_hasil_checklists",
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
            });
        }

        const queryOptions = {
            where,
            attributes: { exclude: excludeAttrs },
            include: includes,
            order,
        };

        if (!hasPagination) {
            const data = await Realisasi.findAll(queryOptions);
            return response.okList(res, data.map((item) => serializeRealisasi(item, req)), {
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
            rows.map((item) => serializeRealisasi(item, req)),
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
                inv.inv_serial_number AS inv_serial_number,
                v.inv_kondisi_awal,
                v.inv_pabrik_kode,
                COALESCE(v.teknisi_nama, u.user_nama) AS teknisi_nama,
                COALESCE(v.teknisi_divisi, u.user_divisi) AS teknisi_divisi,
                v.approver_nama
            FROM plan_realisasi r
            LEFT JOIN v_realisasi_detail v ON v.real_id = r.real_id
            LEFT JOIN plan_inventaris inv ON inv.inv_id = r.real_inv_id
            LEFT JOIN plan_user u ON u.user_id = r.real_teknisi_id
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
                inv_serial_number: row.inv_serial_number,
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
                        error: `Inventaris belum melewati gap realisasi ${gapHari} hari. Bisa direalisasikan lagi pada ${formatDateDisplay(nextEligibleDate)}`,
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
        const targetCount = Number(jadwal.jdw_target || 0);
        const totalSelesaiJadwal = await Realisasi.count({
            where: {
                real_jadwal_id,
                real_status: "Selesai",
            },
        });
        const isCycleCompleted =
            targetCount > 0 ? totalSelesaiJadwal >= targetCount : true;

        if (isCycleCompleted) {
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
                            error: `Jadwal ini memiliki gap realisasi ${jadwalGapHari} hari. Realisasi berikutnya dapat dilakukan pada ${formatDateDisplay(nextEligibleDate)}`,
                            status: 400,
                        };
                    }
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

        const real = await Realisasi.findByPk(req.params.id, {
            include: [
                { model: User, as: "real_teknisi" },
                { model: Inventaris, as: "real_inv" },
            ],
        });
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

        // Buat nama berkas terstandar: [Teknisi]_[Tanggal]_[Inventaris]_[Timestamp].[ext]
        const sanitizeForFilename = (str) => {
            if (!str) return "";
            return String(str)
                .trim()
                .replace(/[^a-zA-Z0-9\-_]/g, "_")
                .replace(/_+/g, "_");
        };

        const teknisiName = sanitizeForFilename(
            real.real_teknisi?.user_nama || req.user?.user_nama || "Teknisi",
        );
        const tgl = sanitizeForFilename(
            real.real_tgl || new Date().toISOString().slice(0, 10),
        );
        const invName = sanitizeForFilename(
            real.real_inv?.inv_nama || real.real_inv?.inv_no || "Inventaris",
        );

        const ext = path.extname(req.file.filename).toLowerCase() || ".jpg";
        const standardizedFilename = `${teknisiName}_${tgl}_${invName}_${Date.now()}${ext}`;

        const uploadDir = path.join(__dirname, "../../public/image/realisasi");
        const tempFilePath = path.join(uploadDir, req.file.filename);
        const finalFilePath = path.join(uploadDir, standardizedFilename);

        // Ubah nama file temp ke nama standar
        if (fs.existsSync(tempFilePath)) {
            fs.renameSync(tempFilePath, finalFilePath);
        }

        // Kompres gambar otomatis hingga maksimal 10 KB sebelum disimpan
        await compressImageToTargetSize(finalFilePath, 10);

        // Simpan nama file standar ke database
        real.real_foto = standardizedFilename;
        await real.save();

        const fileUrl = `${req.protocol}://${req.get("host")}/public/image/realisasi/${standardizedFilename}`;
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

const getKendala = async (req, res, next) => {
    try {
        const { divisi, bulan, tahun, tindak_lanjut } = req.query;
        const where = {
            real_status: "Selesai",
            real_kondisi_akhir: {
                [Op.in]: ["Rusak", "Perlu Perhatian"],
            },
        };

        if (bulan) where.real_bulan = bulan;
        if (tahun) where.real_tahun = tahun;

        const isAdmin = isAdminUser(req);
        const isManager = isManagerUser(req);
        const userDivisi =
            normalizeDivisi(req.user.user_divisi) || req.user.user_divisi;

        const includeJadwal = {
            model: Jadwal,
            as: "real_jadwal",
            attributes: [
                "jdw_id",
                "jdw_judul",
                "jdw_frekuensi",
                "jdw_divisi",
                "jdw_status",
            ],
        };

        let targetDivisiKendala = null;
        if (
            divisi &&
            String(divisi).toLowerCase() !== "true" &&
            String(divisi).toLowerCase() !== "false"
        ) {
            targetDivisiKendala = divisi;
        } else if (req.query.by_divisi) {
            if (String(req.query.by_divisi).toLowerCase() === "true") {
                targetDivisiKendala = userDivisi;
            } else if (String(req.query.by_divisi).toLowerCase() !== "false") {
                targetDivisiKendala = req.query.by_divisi;
            }
        } else if (!isAdmin && !isManager) {
            targetDivisiKendala = userDivisi;
        }

        if (targetDivisiKendala) {
            includeJadwal.where = { jdw_divisi: targetDivisiKendala };
        }

        // 1. Fetch data kendala tanpa subquery correlated yang membebankan database
        const list = await Realisasi.findAll({
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
                        "inv_serial_number",
                        "inv_pabrik_kode",
                        "inv_pic",
                    ],
                },
                {
                    model: User,
                    as: "real_teknisi",
                    attributes: ["user_id", "user_nama", "user_divisi"],
                },
                {
                    model: HasilChecklist,
                    as: "plan_hasil_checklists",
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
                },
            ],
            order: [
                ["real_tgl", "DESC"],
                ["real_id", "DESC"],
            ],
        });

        if (list.length === 0) {
            return response.ok(
                res,
                [],
                "Berhasil mengambil data kendala maintenance",
            );
        }

        // 2. Batching query tindak lanjut per inv_id (Hanya 1 query batch ringan untuk semua item)
        const invIds = [...new Set(list.map((r) => r.real_inv_id))];
        const nextBaikList = await Realisasi.findAll({
            where: {
                real_inv_id: { [Op.in]: invIds },
                real_status: "Selesai",
                real_kondisi_akhir: "Baik",
            },
            attributes: ["real_inv_id", "real_tgl", "real_id"],
            order: [
                ["real_tgl", "ASC"],
                ["real_id", "ASC"],
            ],
            raw: true,
        });

        // Grouping data tindak lanjut per inv_id di JS Memory
        const nextBaikMap = {};
        for (const nb of nextBaikList) {
            if (!nextBaikMap[nb.real_inv_id]) nextBaikMap[nb.real_inv_id] = [];
            nextBaikMap[nb.real_inv_id].push(nb);
        }

        // 3. Match status tindak lanjut secara cepat di JS Memory
        let data = list.map((item) => {
            const plainObj = serializeRealisasi(item, req);
            const invFollowUps = nextBaikMap[item.real_inv_id] || [];

            // Cari tindak lanjut perbaikan pertama yang berkondisi "Baik" setelah tanggal kendala ini
            const nextBaik = invFollowUps.find((nb) => {
                if (nb.real_tgl > item.real_tgl) return true;
                if (nb.real_tgl === item.real_tgl && nb.real_id > item.real_id)
                    return true;
                return false;
            });

            const isHandled = Boolean(nextBaik);
            const tglHandled = nextBaik ? nextBaik.real_tgl : null;

            plainObj.is_tindak_lanjut = isHandled ? 1 : 0;
            plainObj.tindak_lanjut_info =
                isHandled && tglHandled
                    ? `Unit telah direalisasikan kembali dengan kondisi Baik pada ${tglHandled}`
                    : null;
            return plainObj;
        });

        // Filter status tindak lanjut (1 / 0) jika parameter dikirim
        if (tindak_lanjut === "1") {
            data = data.filter((item) => item.is_tindak_lanjut === 1);
        } else if (tindak_lanjut === "0") {
            data = data.filter((item) => item.is_tindak_lanjut === 0);
        }

        return response.ok(
            res,
            data,
            "Berhasil mengambil data kendala maintenance",
        );
    } catch (err) {
        next(err);
    }
};

const exportExcel = async (req, res, next) => {
    try {
        const {
            jadwal_id,
            status,
            bulan,
            tahun,
            teknisi_id,
            by_divisi,
            divisi,
        } = req.query;

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

        if (isSelfOnly && !jadwal_id) {
            where.real_teknisi_id = req.user.user_id;
        }

        let targetDivisi = null;
        if (
            divisi &&
            String(divisi).toLowerCase() !== "true" &&
            String(divisi).toLowerCase() !== "false"
        ) {
            targetDivisi = divisi;
        } else if (by_divisi) {
            if (String(by_divisi).toLowerCase() === "true") {
                targetDivisi = userDivisi;
            } else if (String(by_divisi).toLowerCase() !== "false") {
                targetDivisi = by_divisi;
            }
        } else if (!isManager) {
            targetDivisi = userDivisi;
        }

        if (targetDivisi) {
            includeJadwal.where = { jdw_divisi: targetDivisi };
        }

        const data = await Realisasi.findAll({
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
                        "inv_serial_number",
                        "inv_pabrik_kode",
                        "inv_pic",
                    ],
                    include: [
                        {
                            model: Jenis,
                            as: "jenis",
                            attributes: ["jenis_nama"],
                        },
                    ],
                },
                {
                    model: User,
                    as: "real_teknisi",
                    attributes: [
                        "user_id",
                        "user_nama",
                        "user_divisi",
                        "user_jabatan",
                    ],
                },
            ],
            order: [
                ["real_tgl", "DESC"],
                ["real_id", "DESC"],
            ],
        });

        // Filter teknisi nama jika teknisi_id dipasang
        let filterTeknisiNama = "Semua Pelaksana";
        if (teknisi_id) {
            const teknisiUser = await User.findByPk(teknisi_id, {
                attributes: ["user_nama"],
            });
            if (teknisiUser) filterTeknisiNama = teknisiUser.user_nama;
        }

        // Build Excel Workbook
        const workbook = new ExcelJS.Workbook();
        workbook.creator = "PlanKP System";
        workbook.created = new Date();

        const sheet = workbook.addWorksheet("Laporan Realisasi", {
            pageSetup: { paperSize: 9, orientation: "landscape" },
        });

        const months = [
            "Januari",
            "Februari",
            "Maret",
            "April",
            "Mei",
            "Juni",
            "Juli",
            "Agustus",
            "September",
            "Oktober",
            "November",
            "Desember",
        ];
        const monthLabel = bulan
            ? months[Number(bulan) - 1] || bulan
            : "Semua Bulan";
        const yearLabel = tahun || "Semua Tahun";
        const divisiLabel = targetDivisi || "Semua Divisi";

        const now = new Date();
        const d = String(now.getDate()).padStart(2, "0");
        const m = String(now.getMonth() + 1).padStart(2, "0");
        const y = now.getFullYear();
        const hh = String(now.getHours()).padStart(2, "0");
        const mm = String(now.getMinutes()).padStart(2, "0");
        const printStr = `${d}/${m}/${y} ${hh}:${mm}`;

        // ── Row 1: Header Perusahaan & Tanggal Cetak (Compact Header) ─────────────
        sheet.getCell("A1").value =
            "CV. KENCANA PRINT — LAPORAN REALISASI MAINTENANCE";
        sheet.getCell("A1").font = {
            name: "Calibri",
            size: 12,
            bold: true,
            color: { argb: "285AC8" },
        };
        sheet.mergeCells("A1:I1");

        sheet.getCell("J1").value = `Dicetak: ${printStr}`;
        sheet.getCell("J1").font = {
            name: "Calibri",
            size: 9,
            color: { argb: "64748B" },
        };
        sheet.getCell("J1").alignment = {
            vertical: "middle",
            horizontal: "right",
        };
        sheet.mergeCells("J1:M1");

        // ── Hitung total target unit & persentase capaian secara presisi ───────────
        let totalTargetUnit = 0;
        if (bulan && tahun) {
            const mNum = Number(bulan);
            const yNum = Number(tahun);
            const startDate = new Date(yNum, mNum - 1, 1);
            const endDate = new Date(yNum, mNum, 0);
            const holidays = await getHolidaysForMonth(yNum, mNum);

            const jadwalWhere = {
                jdw_status: { [Op.in]: ["Draft", "Aktif"] },
            };
            if (targetDivisi) {
                jadwalWhere.jdw_divisi = targetDivisi;
            }

            const activeJadwalList = await Jadwal.findAll({
                where: jadwalWhere,
            });

            for (const j of activeJadwalList) {
                if (j.jdw_tgl_mulai) {
                    const tglMulai = new Date(j.jdw_tgl_mulai);
                    if (!isNaN(tglMulai.getTime()) && tglMulai > endDate)
                        continue;
                }
                if (j.jdw_tgl_selesai) {
                    const tglSelesai = new Date(j.jdw_tgl_selesai);
                    if (!isNaN(tglSelesai.getTime()) && tglSelesai < startDate)
                        continue;
                }

                const perTarget =
                    j.jdw_target && j.jdw_target > 0
                        ? j.jdw_target
                        : j.jdw_total_unit && j.jdw_total_unit > 0
                          ? j.jdw_total_unit
                          : 1;
                const appearances = getEffectiveScheduleDatesInMonth(
                    j,
                    startDate,
                    endDate,
                    holidays,
                );
                totalTargetUnit += appearances.length * perTarget;
            }
        }

        const totalRealisasi = data.length;
        const targetVal =
            totalTargetUnit > 0
                ? totalTargetUnit
                : totalRealisasi > 0
                  ? totalRealisasi
                  : 1;
        const percentage = Math.min(
            100,
            Math.max(0, Math.round((totalRealisasi / targetVal) * 100)),
        );

        // ── Row 2: Ringkasan Filter & KPI Maintenance Streamlined ─────────────────
        sheet.getCell("A2").value =
            `Divisi: ${divisiLabel}  |  Periode: ${monthLabel} ${yearLabel}  |  Pelaksana: ${filterTeknisiNama}  |  Realisasi/Target: ${totalRealisasi}/${targetVal} (Capaian: ${percentage}%)`;
        sheet.getCell("A2").font = {
            name: "Calibri",
            size: 9.5,
            bold: true,
            color: { argb: "0F172A" },
        };
        sheet.mergeCells("A2:M2");

        // ── Row 3: Accent Border Line Primary Blue ─────────────────────────────────
        for (let col = 1; col <= 13; col++) {
            const cell = sheet.getCell(3, col);
            cell.border = {
                bottom: { style: "medium", color: { argb: "285AC8" } },
            };
        }

        // ── Row 4: Table Header Row (Data dimulai langsung di Row 5!) ──────────────
        const headers = [
            "No", // Col 1
            "Tgl Realisasi", // Col 2
            "Divisi", // Col 3
            "Pelaksana", // Col 4
            "Serial Number", // Col 5
            "Nama Inventaris", // Col 6
            "Jenis Inventaris", // Col 7
            "Pabrik", // Col 8
            "Frekuensi Jadwal", // Col 9
            "Kondisi Akhir", // Col 10
            "Catatan", // Col 11
            "Nama PIC (TTD)", // Col 12
            "Status Realisasi", // Col 13
        ];

        const headerRow = sheet.getRow(4);
        headers.forEach((h, idx) => {
            headerRow.getCell(idx + 1).value = h;
        });
        headerRow.font = {
            name: "Calibri",
            size: 10.5,
            bold: true,
            color: { argb: "FFFFFF" },
        };
        headerRow.height = 24;

        headerRow.eachCell((cell) => {
            cell.fill = {
                type: "pattern",
                pattern: "solid",
                fgColor: { argb: "1E293B" }, // Dark Slate Steel
            };
            cell.alignment = { vertical: "middle", horizontal: "center" };
            cell.border = {
                top: { style: "thin", color: { argb: "94A3B8" } },
                bottom: { style: "medium", color: { argb: "0F172A" } },
                left: { style: "thin", color: { argb: "334155" } },
                right: { style: "thin", color: { argb: "334155" } },
            };
        });

        // Fitur AutoFilter & Freeze Panes (Row 4 sebagai batas freeze)
        sheet.autoFilter = "A4:M4";
        sheet.views = [{ state: "frozen", xSplit: 0, ySplit: 4 }];

        // Data Rows Detail Realisasi (Pengisian Nilai Kolom 1 s/d 13)
        data.forEach((item, index) => {
            const r = item.get({ plain: true });
            const inv = r.real_inv || {};
            const jenis = inv.jenis || inv.inv_jenis || {};
            const teknisi = r.real_teknisi || {};
            const jadwal = r.real_jadwal || {};

            // Col 2: Format tanggal pelaksanaan (DD/MM/YYYY)
            const tglStr = formatDateDisplay(
                r.real_tgl ? new Date(r.real_tgl) : null,
            );
            // Col 3: Divisi pelaksana/jadwal/teknisi
            const divisiStr =
                r.real_divisi ||
                jadwal.jdw_divisi ||
                teknisi.user_divisi ||
                "-";
            // Col 4: Nama teknisi pelaksana maintenance
            const teknisiNama = teknisi.user_nama || r.real_ttd_pic_nama || "-";
            // Col 5: Serial Number inventaris
            const serialNumber = inv.inv_serial_number || inv.inv_no || "-";

            // Col 6 & 7: Nama inventaris gabungan ($namaJenis $namaInventaris) dan jenis inventaris
            const rawNamaInv = (inv.inv_nama || "").trim();
            const jenisNama = (jenis.jenis_nama || "").trim();
            let fullNamaInv = rawNamaInv || "-";
            if (jenisNama && rawNamaInv) {
                if (
                    rawNamaInv.toLowerCase().startsWith(jenisNama.toLowerCase())
                ) {
                    fullNamaInv = rawNamaInv;
                } else {
                    fullNamaInv = `${jenisNama} ${rawNamaInv}`;
                }
            } else if (jenisNama) {
                fullNamaInv = jenisNama;
            }

            // Col 8: Lokasi pabrik unit
            const pabrikKode = inv.inv_pabrik_kode || "-";
            // Col 9: Frekuensi jadwal maintenance (Harian/Mingguan/etc)
            const frekuensi = jadwal.jdw_frekuensi || "-";
            // Col 10: Kondisi akhir unit (Baik / Perlu Perhatian / Rusak)
            const kondisi = r.real_kondisi_akhir || "Baik";
            // Col 11: Catatan temuan / kendala teknisi
            const catatan = r.real_keterangan || "-";
            // Col 12: Nama penanggung jawab / PIC yang menandatangani
            const picNama = r.real_ttd_pic_nama || "-";

            // Col 13: Label status realisasi (mapping per real_status)
            const rawStatus = (r.real_status || "Draft").toString().trim();
            const statusMap = {
                Draft:     "Belum TTD PIC",
                Submitted: "Menunggu Approval",
                Approved:  "Disetujui",
                Selesai:   "Selesai",
            };
            const statusStr = statusMap[rawStatus] ?? rawStatus;

            // Masukkan data baris ke sheet Excel (Kolom A s/d M)
            const row = sheet.addRow([
                index + 1, // Col 1: No
                tglStr, // Col 2: Tanggal Realisasi
                divisiStr, // Col 3: Divisi
                teknisiNama, // Col 4: Teknisi / Pelaksana
                serialNumber, // Col 5: Serial Number
                fullNamaInv, // Col 6: Nama Inventaris ($namaJenis $namaInventaris)
                jenisNama, // Col 7: Jenis Inventaris
                pabrikKode, // Col 8: Pabrik / Lokasi
                frekuensi, // Col 9: Frekuensi Jadwal
                kondisi, // Col 10: Kondisi Akhir
                catatan, // Col 11: Catatan
                picNama, // Col 12: Nama PIC (TTD)
                statusStr, // Col 13: Status Realisasi
            ]);

            const isEven = index % 2 === 0;
            const bgHex = isEven ? "FFFFFF" : "F8FAFC";

            row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
                cell.fill = {
                    type: "pattern",
                    pattern: "solid",
                    fgColor: { argb: bgHex },
                };
                cell.border = {
                    top: { style: "thin", color: { argb: "E2E8F0" } },
                    bottom: { style: "thin", color: { argb: "E2E8F0" } },
                    left: { style: "thin", color: { argb: "E2E8F0" } },
                    right: { style: "thin", color: { argb: "E2E8F0" } },
                };
                cell.alignment = { vertical: "middle", horizontal: "left" };

                // Center align columns 1, 2, 8, 9, 10, 13
                if ([1, 2, 8, 9, 10, 13].includes(colNumber)) {
                    cell.alignment = {
                        vertical: "middle",
                        horizontal: "center",
                    };
                }

                // Kondisi Akhir Styling (Kolom 10 / J)
                if (colNumber === 10) {
                    cell.alignment = {
                        vertical: "middle",
                        horizontal: "center",
                    };
                    cell.font = { bold: true };
                    if (kondisi === "Baik") {
                        cell.font = { bold: true, color: { argb: "16A34A" } };
                    } else if (kondisi === "Perlu Perhatian") {
                        cell.font = { bold: true, color: { argb: "D97706" } };
                    } else if (kondisi === "Rusak") {
                        cell.font = { bold: true, color: { argb: "DC2626" } };
                    }
                }
            });
        });

        // Auto-fit column widths
        sheet.columns.forEach((column) => {
            let maxLength = 0;
            column.eachCell({ includeEmpty: true }, (cell) => {
                const valStr = cell.value ? String(cell.value) : "";
                if (valStr.length > maxLength) {
                    maxLength = valStr.length;
                }
            });
            column.width = Math.max(maxLength + 4, 14);
        });

        const safeDivisiFile = divisiLabel.replace(/[^a-zA-Z0-9]/g, "_");
        const filename = `Laporan_Maintenance_${safeDivisiFile}_${monthLabel}_${yearLabel}.xlsx`;

        res.setHeader(
            "Content-Type",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        );
        res.setHeader(
            "Content-Disposition",
            `attachment; filename="${filename}"`,
        );

        await workbook.xlsx.write(res);
        res.end();
    } catch (err) {
        next(err);
    }
};

module.exports = {
    getAll,
    getOne,
    getKendala,
    checkEligibility,
    create,
    update,
    saveChecklist,
    saveTtd,
    getTemplate,
    uploadFoto,
    exportExcel,
};
