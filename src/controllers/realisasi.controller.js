const {
    plan_realisasi: Realisasi,
    plan_hasil_checklist: HasilChecklist,
    plan_jadwal: Jadwal,
    plan_inventaris: Inventaris,
    plan_checklist_template: ChecklistTemplate,
    plan_user: User,
    sequelize,
} = require("../models");
const { QueryTypes } = require("sequelize");
const response = require("../utils/response");
const { normalizeDivisi } = require("../utils/divisi");
const { parsePagination, buildMeta } = require("../utils/pagination");
const {
    getWeekNumber: getWeekNumberUtil,
    getMonthNumber,
    getYear,
    formatDateOnly,
} = require("../utils/date-helper");

const isDuplicateByLatestPeriode = (frekuensi, latest, periodContext) => {
    if (!latest) return false;

    switch (frekuensi) {
        case "Harian":
            return latest.real_tgl === periodContext.date;
        case "Mingguan":
            return (
                Number(latest.real_tahun) === Number(periodContext.year) &&
                Number(latest.real_week_number) ===
                    Number(periodContext.weekNumber)
            );
        case "Bulanan":
            return (
                Number(latest.real_tahun) === Number(periodContext.year) &&
                Number(latest.real_bulan) === Number(periodContext.month)
            );
        default:
            return latest.real_tgl === periodContext.date;
    }
};

const describePeriod = (frekuensi, { date, weekNumber, month, year }) => {
    switch (frekuensi) {
        case "Harian":
            return `tanggal ${formatDateOnly(date) ?? date}`;
        case "Mingguan":
            return `minggu ke-${weekNumber} tahun ${year}`;
        case "Bulanan":
            return `bulan ${month} tahun ${year}`;
        default:
            return `periode berjalan (${formatDateOnly(date) ?? date})`;
    }
};

const isAdminUser = (req) =>
    String(req.user?.user_jabatan || "").toLowerCase() === "admin";

const isSelfOnlyRealisasiRole = (req) => {
    const role = String(req.user?.user_jabatan || "").toLowerCase();
    return ["user", "teknisi", "it_support"].includes(role);
};

const splitPabrikCodes = (value) => {
    if (!value) return [];
    const raw = Array.isArray(value) ? value : String(value).split(/[;,]/);
    return raw
        .map((code) => String(code).trim())
        .filter((code) => code.length > 0);
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

// GET /realisasi?jadwal_id=1&status=Draft&bulan=3&tahun=2025
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

        const useDivisiScope = String(by_divisi || "").toLowerCase() === "true";
        const isAdmin = isAdminUser(req);
        const selfOnlyScope = !isAdmin && isSelfOnlyRealisasiRole(req);
        const userDivisi =
            normalizeDivisi(req.user.user_divisi) || req.user.user_divisi;

        if (useDivisiScope && !isAdmin && !selfOnlyScope) {
            includeJadwal.where = { jdw_divisi: userDivisi };
        }

        // Role user/teknisi/it_support selalu hanya boleh melihat realisasi miliknya.
        if (selfOnlyScope) {
            where.real_teknisi_id = req.user.user_id;
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
                    ...(isAdmin
                        ? {
                              // Admin hanya bisa melihat realisasi dari role user di divisi yang sama.
                              where: {
                                  user_divisi: userDivisi,
                                  user_jabatan: "user",
                              },
                          }
                        : {}),
                },
            ],
            order,
        };

        if (!hasPagination) {
            const data = await Realisasi.findAll(queryOptions);
            return response.ok(res, data.map(serializeRealisasi));
        }

        const { count, rows } = await Realisasi.findAndCountAll({
            ...queryOptions,
            limit,
            offset,
            distinct: true,
            col: "real_id",
        });

        return response.ok(res, {
            items: rows.map(serializeRealisasi),
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
        const selfOnlyScope = !isAdmin && isSelfOnlyRealisasiRole(req);
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
        } else if (isAdmin) {
            const teknisi = await User.findByPk(row.real_teknisi_id, {
                attributes: ["user_id", "user_divisi", "user_jabatan"],
            });
            const teknisiDivisi = teknisi
                ? normalizeDivisi(teknisi.user_divisi) || teknisi.user_divisi
                : row.teknisi_divisi;
            const teknisiJabatan = String(
                teknisi?.user_jabatan || "",
            ).toLowerCase();

            if (teknisiJabatan !== "user") {
                return response.error(
                    res,
                    "Akses detail realisasi ditolak",
                    403,
                );
            }

            if (teknisiDivisi && teknisiDivisi !== userDivisi) {
                return response.error(
                    res,
                    "Akses detail realisasi ditolak",
                    403,
                );
            }
        } else if (!isAdmin) {
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

        if (!real_jadwal_id || !real_inv_id || !real_tgl)
            return response.error(
                res,
                "Jadwal, inventaris, dan tanggal wajib diisi",
                400,
            );

        const tgl = new Date(real_tgl);
        const bulan = getMonthNumber(tgl);
        const tahun = getYear(tgl);
        const weekNo = getWeekNumberUtil(tgl);

        const jadwal = await Jadwal.findByPk(real_jadwal_id, {
            attributes: [
                "jdw_id",
                "jdw_frekuensi",
                "jdw_week_number",
                "jdw_bulan",
                "jdw_tahun",
                "jdw_tgl_mulai",
                "jdw_jenis_id",
                "jdw_pabrik_kode",
                "jdw_status",
            ],
        });
        if (!jadwal) return response.error(res, "Jadwal tidak ditemukan", 404);

        if (jadwal.jdw_status !== "Draft") {
            return response.error(
                res,
                "Jadwal harus berstatus Draft untuk realisasi",
                400,
            );
        }

        const inventaris = await Inventaris.findOne({
            where: {
                inv_id: real_inv_id,
                inv_is_active: 1,
            },
            attributes: ["inv_id", "inv_jenis_id", "inv_pabrik_kode"],
        });
        if (!inventaris) {
            return response.error(
                res,
                "Inventaris tidak ditemukan atau tidak aktif",
                404,
            );
        }

        if (Number(inventaris.inv_jenis_id) !== Number(jadwal.jdw_jenis_id)) {
            return response.error(
                res,
                "Inventaris tidak sesuai dengan jenis pada jadwal",
                400,
            );
        }

        const allowedPabrikCodes = splitPabrikCodes(jadwal.jdw_pabrik_kode);
        if (
            allowedPabrikCodes.length > 0 &&
            !allowedPabrikCodes.includes(String(inventaris.inv_pabrik_kode))
        ) {
            return response.error(
                res,
                "Inventaris tidak termasuk pabrik/lokasi jadwal",
                400,
            );
        }

        const periodContext = {
            date: real_tgl,
            weekNumber: weekNo,
            month: bulan,
            year: tahun,
        };

        const latestRealisasi = await Realisasi.findOne({
            where: {
                real_jadwal_id,
                real_inv_id,
            },
            order: [
                ["real_tahun", "DESC"],
                ["real_bulan", "DESC"],
                ["real_week_number", "DESC"],
                ["real_tgl", "DESC"],
                ["real_id", "DESC"],
            ],
        });

        if (
            isDuplicateByLatestPeriode(
                jadwal.jdw_frekuensi,
                latestRealisasi,
                periodContext,
            )
        )
            return response.error(
                res,
                `Inventaris sudah direalisasi pada ${describePeriod(
                    jadwal.jdw_frekuensi,
                    periodContext,
                )}`,
                400,
            );

        const data = await Realisasi.create({
            real_jadwal_id,
            real_inv_id,
            real_teknisi_id: req.user.user_id,
            real_tgl,
            real_jam_mulai,
            real_jam_selesai,
            real_week_number: weekNo,
            real_bulan: bulan,
            real_tahun: tahun,
            real_kondisi_akhir,
            real_keterangan,
            real_status: "Draft",
        });

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

module.exports = {
    getAll,
    getOne,
    create,
    update,
    saveChecklist,
    saveTtd,
    getTemplate,
};
