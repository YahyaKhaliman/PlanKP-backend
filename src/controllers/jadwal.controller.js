const {
    plan_jadwal: Jadwal,
    plan_user: User,
    plan_inventaris: Inventaris,
    sequelize,
} = require("../models");
const UserService = require("../services/user.service");
const { Op, QueryTypes } = require("sequelize");
const response = require("../utils/response");
const { normalizeDivisi } = require("../utils/divisi");
const { parsePagination, buildMeta } = require("../utils/pagination");
const {
    getWeekNumber: getWeekNumberUtil,
    getMonthNumber,
    getYear,
    calculateJadwalCountdown,
    formatDateOnly,
} = require("../utils/date-helper");

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

const splitPabrikCodes = (value) => {
    if (!value) return [];
    const raw = Array.isArray(value) ? value : String(value).split(/[;,]/);
    const unique = new Set();
    raw.forEach((code) => {
        const cleaned = String(code).trim();
        if (cleaned) unique.add(cleaned);
    });
    return Array.from(unique);
};

const hasPabrikOverlap = (existingCodes, incomingCodes) => {
    const existingList = splitPabrikCodes(existingCodes);
    if (!incomingCodes.length || !existingList.length) return true;
    return existingList.some((code) => incomingCodes.includes(code));
};

const serializeJadwal = (item) => {
    const plain = item.get({ plain: true });
    plain.assigned_user = plain.jdw_assigned_to_plan_user || null;
    plain.dibuat_user = plain.jdw_dibuat_oleh_plan_user || null;

    const countdown = calculateJadwalCountdown({
        startDate: plain.jdw_tgl_mulai,
        frekuensi: plain.jdw_frekuensi,
        target: plain.jdw_target,
        selesaiUnit: plain.jdw_selesai_unit,
    });

    plain.jdw_period_fulfilled = countdown.periodFulfilled;
    plain.jdw_current_period_start = countdown.currentPeriodStart;
    plain.jdw_next_due_date = countdown.nextDueDate;
    plain.jdw_days_remaining = countdown.daysRemaining;
    plain.jdw_pabrik_list = splitPabrikCodes(plain.jdw_pabrik_kode);

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
        return 0;
    }

    const total = await Inventaris.count({
        where: {
            inv_jenis_id: normalizedJenisId,
            inv_is_active: 1,
        },
    });

    return total;
};

// helper: hitung week_number, bulan, tahun dari tanggal (pakai utility untuk konsistensi)
const calculateDateComponents = (dateStr) => {
    return {
        weekNumber: getWeekNumberUtil(new Date(dateStr)),
        month: getMonthNumber(new Date(dateStr)),
        year: getYear(new Date(dateStr)),
    };
};

const buildCurrentPeriodDoneCountLiteral = () => `(
    SELECT COUNT(DISTINCT r.real_inv_id)
    FROM plan_realisasi r
    WHERE r.real_jadwal_id = plan_jadwal.jdw_id
      AND r.real_status = 'Selesai'
      AND (
        (plan_jadwal.jdw_frekuensi = 'Harian' AND r.real_tgl = CURDATE())
        OR (
            plan_jadwal.jdw_frekuensi = 'Mingguan'
            AND r.real_tahun = YEAR(CURDATE())
            AND r.real_week_number = WEEK(CURDATE(), 3)
        )
        OR (
            plan_jadwal.jdw_frekuensi = 'Bulanan'
            AND r.real_tahun = YEAR(CURDATE())
            AND r.real_bulan = MONTH(CURDATE())
        )
      )
)`;

const buildComputedAttributes = () => {
    const currentPeriodDoneCount = buildCurrentPeriodDoneCountLiteral();

    return [
        [
            sequelize.literal(`(
                SELECT COUNT(*)
                FROM plan_inventaris i
                WHERE i.inv_jenis_id = plan_jadwal.jdw_jenis_id
                  AND i.inv_is_active = 1
            )`),
            "jdw_total_unit",
        ],
        [sequelize.literal(currentPeriodDoneCount), "jdw_selesai_unit"],
        [
            sequelize.literal(`(
                COALESCE(
                    ROUND(
                        ((${currentPeriodDoneCount}) / NULLIF(plan_jadwal.jdw_target, 0)) * 100,
                        2
                    ),
                    0
                )
            )`),
            "jdw_capaian_pct",
        ],
    ];
};

const isValidDateInput = (value) => {
    if (!value) return false;
    const d = new Date(value);
    return !Number.isNaN(d.getTime());
};

const parsePositiveId = (value) => {
    const n = Number(value);
    return Number.isInteger(n) && n > 0 ? n : null;
};

const getUserDivisiScope = (req) =>
    normalizeDivisi(req.user.user_divisi) || req.user.user_divisi;

const buildAdminAssignedUserScope = (req) => ({
    user_jabatan: "user",
    user_divisi: getUserDivisiScope(req),
});

const buildPeriodeWhere = ({
    jenisId,
    divisi,
    frekuensi,
    tglMulai,
    bulan,
    tahun,
    weekNumber,
    excludeJadwalId,
}) => {
    const where = {
        jdw_jenis_id: Number(jenisId),
        jdw_divisi: divisi,
        jdw_frekuensi: frekuensi,
    };

    if (frekuensi === "Harian") {
        where.jdw_tgl_mulai = tglMulai;
    } else if (frekuensi === "Mingguan") {
        where.jdw_tahun = tahun;
        where.jdw_week_number = weekNumber;
    } else if (frekuensi === "Bulanan") {
        where.jdw_tahun = tahun;
        where.jdw_bulan = bulan;
    }

    if (excludeJadwalId) {
        where.jdw_id = { [Op.ne]: excludeJadwalId };
    }

    return where;
};

const validatePabrikCodes = async (codes) => {
    if (!codes.length) return [];

    const rows = await sequelize.query(
        `
        SELECT pab_kode
        FROM kencanaprint.tpabrik
        WHERE pab_kode IN (:codes)
        `,
        {
            replacements: { codes },
            type: QueryTypes.SELECT,
        },
    );

    const known = new Set(rows.map((row) => row.pab_kode));
    const invalid = codes.filter((code) => !known.has(code));
    if (invalid.length) {
        const err = new Error(`Kode pabrik tidak valid: ${invalid.join(", ")}`);
        err.status = 400;
        throw err;
    }
    return codes;
};

// GET /jadwal?status=Aktif&jenis=Sewing&assigned_to=1&tgl=2025-03-01
const getAll = async (req, res, next) => {
    try {
        const {
            status,
            jenis,
            assigned_to,
            tgl,
            bulan,
            tahun,
            divisi,
            pabrik_kode,
        } = req.query;
        const { hasPagination, limit, offset } = parsePagination(req.query);
        const order = resolveJadwalSort(req.query.sort, req.query.order);
        const where = {};

        if (tgl && !isValidDateInput(tgl)) {
            return response.error(
                res,
                "Format tanggal filter tidak valid",
                400,
            );
        }
        if (status) where.jdw_status = status;
        if (jenis) where.jdw_jenis_id = jenis;
        if (assigned_to) where.jdw_assigned_to = assigned_to;
        if (bulan) where.jdw_bulan = bulan;
        if (tahun) where.jdw_tahun = tahun;
        if (pabrik_kode) {
            where[Op.and] = where[Op.and] || [];
            where[Op.and].push(
                sequelize.where(
                    sequelize.fn(
                        "FIND_IN_SET",
                        pabrik_kode,
                        sequelize.col("jdw_pabrik_kode"),
                    ),
                    { [Op.gt]: 0 },
                ),
            );
        }
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
        const isUserRole =
            String(req.user.user_jabatan || "").toLowerCase() === "user";
        const userDivisi = getUserDivisiScope(req);
        if (isUserRole) {
            where.jdw_assigned_to = req.user.user_id;
        } else if (!isAdmin) {
            where[Op.and] = where[Op.and] || [];
            where[Op.and].push({
                [Op.or]: [
                    { jdw_divisi: userDivisi },
                    { jdw_assigned_to: req.user.user_id },
                ],
            });
        }

        const queryOptions = {
            where,
            attributes: {
                include: buildComputedAttributes(),
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
                    ...(isAdmin
                        ? {
                              where: buildAdminAssignedUserScope(req),
                              required: true,
                          }
                        : {}),
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
            return response.okList(res, data.map(serializeJadwal), {
                total: data.length,
                itemCount: data.length,
            });
        }

        const { count, rows } = await Jadwal.findAndCountAll({
            ...queryOptions,
            limit,
            offset,
            distinct: true,
            col: "jdw_id",
        });

        return response.okList(
            res,
            rows.map(serializeJadwal),
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

const getByUser = async (req, res, next) => {
    try {
        const { status, jenis, tgl } = req.query;
        const { hasPagination, limit, offset } = parsePagination(req.query);
        const order = resolveJadwalSort(req.query.sort, req.query.order);
        const where = { jdw_assigned_to: req.user.user_id };
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
                include: buildComputedAttributes(),
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
            return response.okList(res, data.map(serializeJadwal), {
                total: data.length,
                itemCount: data.length,
            });
        }

        const { count, rows } = await Jadwal.findAndCountAll({
            ...queryOptions,
            limit,
            offset,
            distinct: true,
            col: "jdw_id",
        });

        return response.okList(
            res,
            rows.map(serializeJadwal),
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

const getByDivisi = async (req, res, next) => {
    try {
        const { status, jenis, tgl } = req.query;
        const { hasPagination, limit, offset } = parsePagination(req.query);
        const order = resolveJadwalSort(req.query.sort, req.query.order);
        const isAdmin = req.user.user_jabatan === "admin";
        const userDivisi = getUserDivisiScope(req);
        const where = { jdw_divisi: userDivisi };
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
                include: buildComputedAttributes(),
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
                    ...(isAdmin
                        ? {
                              where: buildAdminAssignedUserScope(req),
                              required: true,
                          }
                        : {}),
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
            return response.okList(res, data.map(serializeJadwal), {
                total: data.length,
                itemCount: data.length,
            });
        }

        const { count, rows } = await Jadwal.findAndCountAll({
            ...queryOptions,
            limit,
            offset,
            distinct: true,
            col: "jdw_id",
        });

        return response.okList(
            res,
            rows.map(serializeJadwal),
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
const getOne = async (req, res, next) => {
    try {
        const jadwalId = parsePositiveId(req.params.id);
        if (!jadwalId) return response.error(res, "Id jadwal tidak valid", 400);

        const data = await Jadwal.findByPk(jadwalId, {
            attributes: {
                include: buildComputedAttributes(),
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
        });
        if (!data) return response.error(res, "Jadwal tidak ditemukan", 404);

        const isAdmin = req.user.user_jabatan === "admin";
        const userDivisi = getUserDivisiScope(req);
        const assignedUser = data.jdw_assigned_to_plan_user;
        if (req.adminScope && data.jdw_divisi !== req.adminScope) {
            return response.error(
                res,
                "Akses jadwal lintas divisi ditolak",
                403,
            );
        }
        if (isAdmin) {
            const assignedRole = String(
                assignedUser?.user_jabatan || "",
            ).toLowerCase();
            const assignedDivisi =
                normalizeDivisi(assignedUser?.user_divisi) ||
                assignedUser?.user_divisi;
            if (
                !assignedUser ||
                assignedRole !== "user" ||
                assignedDivisi !== userDivisi
            ) {
                return response.error(res, "Akses jadwal ditolak", 403);
            }
        }
        if (!isAdmin) {
            const allowedDivisi = userDivisi;
            if (
                data.jdw_divisi !== allowedDivisi &&
                data.jdw_assigned_to !== req.user.user_id
            ) {
                return response.error(res, "Akses jadwal ditolak", 403);
            }
        }

        // ambil inventaris dengan jenis yang sama
        const pabrikCodes = splitPabrikCodes(data.jdw_pabrik_kode);

        const inventarisWhere = {
            inv_jenis_id: data.jdw_jenis_id,
            inv_is_active: 1,
            ...(pabrikCodes.length > 0
                ? { inv_pabrik_kode: { [Op.in]: pabrikCodes } }
                : {}),
        };

        const inventarisList = await Inventaris.findAll({
            where: inventarisWhere,
            attributes: [
                "inv_id",
                "inv_no",
                "inv_merk",
                "inv_nama",
                "inv_jenis_id",
                "inv_pabrik_kode",
                "inv_pic",
                "inv_kondisi",
            ],
            order: [["inv_nama", "ASC"]],
        });

        const jadwalPayload = serializeJadwal(data);

        return response.ok(res, {
            jadwal: jadwalPayload,
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
            jdw_target,
            jdw_assigned_to,
            jdw_pabrik_kode,
            jdw_notes,
        } = req.body;
        const normalizedDivisi = req.adminScope || normalizeDivisi(jdw_divisi);

        if (
            !jdw_judul ||
            !jdw_jenis_id ||
            !(req.adminScope || jdw_divisi) ||
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
        if (!["Harian", "Mingguan", "Bulanan"].includes(jdw_frekuensi))
            return response.error(res, "Frekuensi jadwal tidak valid", 400);
        if (!isValidDateInput(jdw_tgl_mulai))
            return response.error(res, "Tanggal mulai tidak valid", 400);
        if (jdw_tgl_selesai && !isValidDateInput(jdw_tgl_selesai))
            return response.error(res, "Tanggal selesai tidak valid", 400);

        const parsedTarget = Number(jdw_target ?? 1);
        if (!Number.isInteger(parsedTarget) || parsedTarget < 1)
            return response.error(
                res,
                "Target jadwal wajib berupa angka bulat minimal 1",
                400,
            );

        const totalInventaris = await jenisHasActiveInventaris(jdw_jenis_id);
        if (totalInventaris === 0) {
            return response.error(
                res,
                "Jenis inventaris belum memiliki unit inventaris aktif",
                400,
            );
        }
        if (parsedTarget > totalInventaris) {
            return response.error(
                res,
                `Target tidak boleh melebihi total inventaris jenis (max: ${totalInventaris})`,
                400,
            );
        }

        const tgl = new Date(jdw_tgl_mulai);
        const dateComp = calculateDateComponents(jdw_tgl_mulai);
        const bulan = dateComp.month;
        const tahun = dateComp.year;
        const weekNo = dateComp.weekNumber;

        const parsedPabrikCodes = splitPabrikCodes(jdw_pabrik_kode);
        await validatePabrikCodes(parsedPabrikCodes);

        const duplicateCandidates = await Jadwal.findAll({
            where: buildPeriodeWhere({
                jenisId: jdw_jenis_id,
                divisi: normalizedDivisi,
                frekuensi: jdw_frekuensi,
                tglMulai: jdw_tgl_mulai,
                bulan,
                tahun,
                weekNumber: weekNo,
            }),
            attributes: ["jdw_id", "jdw_pabrik_kode"],
        });
        const hasConflict = duplicateCandidates.some((row) =>
            hasPabrikOverlap(row.jdw_pabrik_kode, parsedPabrikCodes),
        );
        if (hasConflict)
            return response.error(
                res,
                "Jadwal untuk kombinasi jenis, divisi, periode, dan pabrik tersebut sudah ada",
                400,
            );
        const pabrikString = parsedPabrikCodes.length
            ? parsedPabrikCodes.join(",")
            : null;

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
            jdw_target: parsedTarget,
            jdw_assigned_to: jdw_assigned_to || null,
            jdw_pabrik_kode: pabrikString,
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
        const jadwalId = parsePositiveId(req.params.id);
        if (!jadwalId) return response.error(res, "Id jadwal tidak valid", 400);

        const data = await Jadwal.findByPk(jadwalId);
        if (!data) return response.error(res, "Jadwal tidak ditemukan", 404);
        if (req.adminScope && data.jdw_divisi !== req.adminScope) {
            return response.error(
                res,
                "Akses jadwal lintas divisi ditolak",
                403,
            );
        }
        const fields = [
            "jdw_judul",
            "jdw_jenis_id",
            "jdw_frekuensi",
            "jdw_divisi",
            "jdw_tgl_mulai",
            "jdw_tgl_selesai",
            "jdw_target",
            "jdw_assigned_to",
            "jdw_pabrik_kode",
            "jdw_notes",
        ];
        fields.forEach((f) => {
            if (req.body[f] !== undefined) data[f] = req.body[f];
        });
        if (req.body.jdw_divisi !== undefined) {
            const normalizedDivisi =
                req.adminScope || normalizeDivisi(req.body.jdw_divisi);
            if (!normalizedDivisi)
                return response.error(res, "Divisi tidak valid", 400);
            data.jdw_divisi = normalizedDivisi;
        }

        if (req.body.jdw_pabrik_kode !== undefined) {
            const parsedPabrikCodes = splitPabrikCodes(
                req.body.jdw_pabrik_kode,
            );
            await validatePabrikCodes(parsedPabrikCodes);
            data.jdw_pabrik_kode = parsedPabrikCodes.length
                ? parsedPabrikCodes.join(",")
                : null;
        }

        if (req.body.jdw_jenis_id !== undefined) {
            const totalInventaris = await jenisHasActiveInventaris(
                req.body.jdw_jenis_id,
            );
            if (totalInventaris === 0) {
                return response.error(
                    res,
                    "Jenis inventaris belum memiliki unit inventaris aktif",
                    400,
                );
            }
            // Jika target juga update, check target <= total inventaris
            const targetToCheck =
                req.body.jdw_target !== undefined
                    ? Number(req.body.jdw_target)
                    : data.jdw_target;
            if (targetToCheck > totalInventaris) {
                return response.error(
                    res,
                    `Target tidak boleh melebihi total inventaris jenis (max: ${totalInventaris})`,
                    400,
                );
            }
        }

        if (req.body.jdw_frekuensi !== undefined) {
            const allowedFrekuensi = ["Harian", "Mingguan", "Bulanan"];
            if (!allowedFrekuensi.includes(data.jdw_frekuensi)) {
                return response.error(res, "Frekuensi jadwal tidak valid", 400);
            }
        }

        if (req.body.jdw_target !== undefined) {
            const parsedTarget = Number(req.body.jdw_target);
            if (!Number.isInteger(parsedTarget) || parsedTarget < 1) {
                return response.error(
                    res,
                    "Target jadwal wajib berupa angka bulat minimal 1",
                    400,
                );
            }
            const totalInventaris = await jenisHasActiveInventaris(
                data.jdw_jenis_id,
            );
            if (parsedTarget > totalInventaris) {
                return response.error(
                    res,
                    `Target tidak boleh melebihi total inventaris jenis (max: ${totalInventaris})`,
                    400,
                );
            }
            data.jdw_target = parsedTarget;
        }

        // recalculate periode berdasarkan tgl_mulai terbaru
        if (!isValidDateInput(data.jdw_tgl_mulai)) {
            return response.error(res, "Tanggal mulai tidak valid", 400);
        }
        if (data.jdw_tgl_selesai && !isValidDateInput(data.jdw_tgl_selesai)) {
            return response.error(res, "Tanggal selesai tidak valid", 400);
        }

        const tgl = new Date(data.jdw_tgl_mulai);
        const dateComp = calculateDateComponents(data.jdw_tgl_mulai);
        data.jdw_bulan = dateComp.month;
        data.jdw_tahun = dateComp.year;
        data.jdw_week_number = dateComp.weekNumber;

        const normalizedCurrentPabrikCodes = splitPabrikCodes(
            data.jdw_pabrik_kode,
        );
        const duplicateCandidates = await Jadwal.findAll({
            where: buildPeriodeWhere({
                jenisId: data.jdw_jenis_id,
                divisi: data.jdw_divisi,
                frekuensi: data.jdw_frekuensi,
                tglMulai: data.jdw_tgl_mulai,
                bulan: data.jdw_bulan,
                tahun: data.jdw_tahun,
                weekNumber: data.jdw_week_number,
                excludeJadwalId: data.jdw_id,
            }),
            attributes: ["jdw_id", "jdw_pabrik_kode"],
        });
        const hasConflict = duplicateCandidates.some((row) =>
            hasPabrikOverlap(row.jdw_pabrik_kode, normalizedCurrentPabrikCodes),
        );
        if (hasConflict)
            return response.error(
                res,
                "Jadwal untuk kombinasi jenis, divisi, periode, dan pabrik tersebut sudah ada",
                400,
            );

        await data.save();
        return response.ok(res, data, "Jadwal berhasil diupdate");
    } catch (err) {
        next(err);
    }
};

// PATCH /jadwal/:id/status  — body: { status: 'Draft' | 'Selesai' }
const updateStatus = async (req, res, next) => {
    try {
        const { status } = req.body;
        const allowed = ["Draft", "Selesai"];
        if (!allowed.includes(status))
            return response.error(res, "Status tidak valid", 400);

        const jadwalId = parsePositiveId(req.params.id);
        if (!jadwalId) return response.error(res, "Id jadwal tidak valid", 400);

        const data = await Jadwal.findByPk(jadwalId);
        if (!data) return response.error(res, "Jadwal tidak ditemukan", 404);
        if (req.adminScope && data.jdw_divisi !== req.adminScope) {
            return response.error(
                res,
                "Akses jadwal lintas divisi ditolak",
                403,
            );
        }
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
        const today = formatDateOnly(now);
        const todayDay = now.getDay();
        const todayDate = now.getDate();
        const frekuensiHariIni = [{ jdw_frekuensi: "Harian" }];
        if (todayDay === 1)
            frekuensiHariIni.push({ jdw_frekuensi: "Mingguan" });
        if (todayDate === 1)
            frekuensiHariIni.push({ jdw_frekuensi: "Bulanan" });

        const where = {
            jdw_status: "Draft",
            jdw_tgl_mulai: { [Op.lte]: today },
            [Op.or]: [
                { jdw_tgl_selesai: null },
                { jdw_tgl_selesai: { [Op.gte]: today } },
            ],
            [Op.and]: [{ [Op.or]: frekuensiHariIni }],
            jdw_divisi: getUserDivisiScope(req),
        };

        const isAdmin = req.user.user_jabatan === "admin";

        const data = await Jadwal.findAll({
            where,
            attributes: {
                include: buildComputedAttributes(),
            },
            include: [
                {
                    model: User,
                    as: "jdw_assigned_to_plan_user",
                    attributes: ["user_id", "user_nama", "user_jabatan"],
                    ...(isAdmin
                        ? {
                              where: buildAdminAssignedUserScope(req),
                              required: true,
                          }
                        : {}),
                },
            ],
            order: [["jdw_tgl_mulai", "ASC"]],
        });
        return response.okList(res, data.map(serializeJadwal), {
            total: data.length,
            itemCount: data.length,
        });
    } catch (err) {
        next(err);
    }
};

module.exports = {
    getAll,
    getByDivisi,
    getByUser,
    getOne,
    create,
    update,
    updateStatus,
    hariIni,
};
