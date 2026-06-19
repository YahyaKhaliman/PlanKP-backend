const { Op, QueryTypes } = require("sequelize");
const {
    sequelize,
    plan_jadwal: Jadwal,
    plan_realisasi: Realisasi,
    plan_jenis: Jenis,
} = require("../models");
const response = require("../utils/response");
const { normalizeDivisi, DIVISI_CANONICAL } = require("../utils/divisi");
const { calculateJadwalCountdown } = require("../utils/date-helper");

const HARI_LIBUR_SCHEMA = process.env.DB_HRD;
const HARI_LIBUR_TABLE = "tharilibur";
const HARI_LIBUR_DATE_COLUMN_CANDIDATES = [
    "hl_tanggal",
    "hlib_tanggal",
    "harilibur_tanggal",
    "tanggal",
    "tgl",
    "date",
];
const HARI_LIBUR_DESC_COLUMN_CANDIDATES = [
    "hl_keterangan",
    "hlib_keterangan",
    "harilibur_keterangan",
    "keterangan",
    "ket",
    "deskripsi",
    "description",
    "nama_libur",
    "uraian",
];

let hariLiburDateColumnCache = null;
let hariLiburDescColumnCache = null;

const escapeIdentifier = (value) => {
    return `\`${String(value).replace(/`/g, "``")}\``;
};

const resolveHariLiburDateColumn = async () => {
    if (hariLiburDateColumnCache) return hariLiburDateColumnCache;
    const columns = await sequelize.query(
        `
        SELECT COLUMN_NAME, DATA_TYPE
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = :schemaName
          AND TABLE_NAME = :tableName
        ORDER BY ORDINAL_POSITION ASC
        `,
        {
            replacements: {
                schemaName: HARI_LIBUR_SCHEMA,
                tableName: HARI_LIBUR_TABLE,
            },
            type: QueryTypes.SELECT,
        },
    );
    if (!columns.length) return null;
    const byName = columns.find((col) =>
        HARI_LIBUR_DATE_COLUMN_CANDIDATES.includes(
            String(col.COLUMN_NAME || "").toLowerCase(),
        ),
    );
    if (byName) {
        hariLiburDateColumnCache = byName.COLUMN_NAME;
        return hariLiburDateColumnCache;
    }
    const byType = columns.find((col) =>
        ["date", "datetime", "timestamp"].includes(
            String(col.DATA_TYPE || "").toLowerCase(),
        ),
    );
    if (byType) {
        hariLiburDateColumnCache = byType.COLUMN_NAME;
        return hariLiburDateColumnCache;
    }
    return null;
};

const getHolidaysForMonth = async (year, month) => {
    const dateColumn = await resolveHariLiburDateColumn();
    if (!dateColumn) return new Set();

    const fullTableName = `${escapeIdentifier(HARI_LIBUR_SCHEMA)}.${escapeIdentifier(HARI_LIBUR_TABLE)}`;
    const dateColumnName = escapeIdentifier(dateColumn);

    const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
    const monthEndDate = new Date(year, month, 0);
    const monthEnd = `${monthEndDate.getFullYear()}-${String(monthEndDate.getMonth() + 1).padStart(2, "0")}-${String(monthEndDate.getDate()).padStart(2, "0")}`;

    const rows = await sequelize.query(
        `
        SELECT
            DATE_FORMAT(DATE(${dateColumnName}), '%Y-%m-%d') AS tanggal
        FROM ${fullTableName}
        WHERE DATE(${dateColumnName}) BETWEEN :monthStart AND :monthEnd
        ORDER BY DATE(${dateColumnName}) ASC
        `,
        {
            replacements: { monthStart, monthEnd },
            type: QueryTypes.SELECT,
        },
    );

    const holidays = new Set();
    rows.forEach((row) => {
        const dateStr = String(row.tanggal || "");
        if (dateStr) {
            const day = new Date(dateStr).getDate();
            holidays.add(day);
        }
    });
    return holidays;
};

const findNextWorkingDay = (date, limit, holidays) => {
    const d = new Date(date);
    while (holidays.has(d.getDate())) {
        d.setDate(d.getDate() + 1);
        if (d > limit) return null;
    }
    return d;
};

const getEffectiveScheduleDatesInMonth = (j, start, end, holidays) => {
    const jStart = j.jdw_tgl_mulai ? new Date(j.jdw_tgl_mulai) : null;
    if (!jStart) return [];
    jStart.setHours(0, 0, 0, 0);

    const rangeStart = jStart > start ? jStart : start;
    const jEndStr = j.jdw_tgl_selesai;
    const jEnd = (!jEndStr || jEndStr === "")
        ? end
        : new Date(jEndStr);
    if (jEnd) jEnd.setHours(0, 0, 0, 0);

    const rangeEnd = jEnd < end ? jEnd : end;
    if (rangeEnd < rangeStart) return [];

    const dates = [];

    if (j.jdw_frekuensi === "Harian") {
        const curr = new Date(rangeStart);
        while (curr <= rangeEnd) {
            if (!holidays.has(curr.getDate())) {
                dates.push(new Date(curr));
            }
            curr.setDate(curr.getDate() + 1);
        }
    } else if (j.jdw_frekuensi === "Mingguan") {
        const curr = new Date(jStart);
        while (curr <= rangeEnd) {
            if (curr >= rangeStart) {
                const nextWork = findNextWorkingDay(curr, rangeEnd, holidays);
                if (nextWork) {
                    dates.push(nextWork);
                }
            }
            curr.setDate(curr.getDate() + 7);
        }
    } else if (j.jdw_frekuensi === "Bulanan") {
        const nextWork = findNextWorkingDay(rangeStart, rangeEnd, holidays);
        if (nextWork) {
            dates.push(nextWork);
        }
    }
    return dates;
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

const JENIS_KATEGORI = DIVISI_CANONICAL;
const JADWAL_FREKUENSI = ["Harian", "Mingguan", "Bulanan"];
const JADWAL_STATUS = ["Draft", "Selesai"];
const REALISASI_STATUS = ["Draft", "Selesai"];
const KONDISI_LIST = ["Baik", "Perlu Perhatian", "Rusak"];

const fetchPabrikList = async () => {
    const dbHelper = process.env.DB_HELPER;
    return sequelize.query(
        `
        SELECT pab_kode, pab_nama, pab_alamat, pab_pabrik
        FROM ${dbHelper}.tpabrik
        ORDER BY pab_kode ASC
        `,
        { type: QueryTypes.SELECT },
    );
};

const getPabrik = async (req, res, next) => {
    try {
        const data = await fetchPabrikList();
        return response.ok(res, data);
    } catch (err) {
        next(err);
    }
};

const getMetadata = async (req, res, next) => {
    try {
        const jenisWhere = { jenis_is_active: 1 };
        if (req.adminScope) {
            jenisWhere.jenis_kategori = req.adminScope;
        }

        const [jenisList, pabrikList] = await Promise.all([
            Jenis.findAll({
                where: jenisWhere,
                attributes: [
                    "jenis_id",
                    "jenis_nama",
                    "jenis_kategori",
                    "jenis_gap_hari",
                ],
                order: [["jenis_nama", "ASC"]],
            }),
            fetchPabrikList(),
        ]);

        return response.ok(res, {
            divisi: DIVISI_CANONICAL,
            kategori_jenis: JENIS_KATEGORI,
            jadwal_frekuensi: JADWAL_FREKUENSI,
            jadwal_status: JADWAL_STATUS,
            realisasi_status: REALISASI_STATUS,
            kondisi_inventaris: KONDISI_LIST,
            jenis: jenisList,
            pabrik: pabrikList,
        });
    } catch (err) {
        next(err);
    }
};

const getDashboardSummary = async (req, res, next) => {
    try {
        const userRole = String(req.user.user_jabatan || "").toLowerCase();
        const isManager = userRole === "manager";
        const isAdmin = userRole === "admin";
        const isSelfOnly = ["user", "teknisi", "it_support"].includes(userRole);

        const userId = req.user.user_id;
        const userDivisi =
            normalizeDivisi(req.user.user_divisi) || req.user.user_divisi;
        const today = new Date().toISOString().split("T")[0];

        const jadwalWhere = { jdw_status: "Selesai" };
        if (isSelfOnly) {
            jadwalWhere.jdw_assigned_to = userId;
        } else if (isAdmin) {
            jadwalWhere[Op.or] = [
                { jdw_divisi: userDivisi },
                { jdw_assigned_to: userId },
            ];
        }

        const jadwalSelesai = await Jadwal.count({ where: jadwalWhere });

        const realisasiTodayWhere = { real_tgl: today };
        if (isSelfOnly) {
            realisasiTodayWhere.real_teknisi_id = userId;
        }

        const realisasiTodayInclude = [];
        if (isAdmin && !realisasiTodayWhere.real_teknisi_id) {
            realisasiTodayInclude.push({
                model: Jadwal,
                as: "real_jadwal",
                attributes: [],
                where: { jdw_divisi: userDivisi },
            });
        }

        const realisasiToday = await Realisasi.count({
            where: realisasiTodayWhere,
            include: realisasiTodayInclude,
        });

        // Hitung realisasi selesai bulan berjalan
        const now = new Date();
        const currentMonth = now.getMonth() + 1;
        const currentYear = now.getFullYear();

        const realisasiBulanIniWhere = {
            real_status: "Selesai",
            real_bulan: currentMonth,
            real_tahun: currentYear,
        };
        if (isSelfOnly) {
            realisasiBulanIniWhere.real_teknisi_id = userId;
        }

        const realisasiBulanIniInclude = [];
        if (isAdmin && !realisasiBulanIniWhere.real_teknisi_id) {
            realisasiBulanIniInclude.push({
                model: Jadwal,
                as: "real_jadwal",
                attributes: [],
                where: { jdw_divisi: userDivisi },
            });
        }

        const realisasiBulanIni = await Realisasi.count({
            where: realisasiBulanIniWhere,
            include: realisasiBulanIniInclude,
        });

        const realisasiDraftWhere = { real_status: "Draft" };
        if (isSelfOnly) {
            realisasiDraftWhere.real_teknisi_id = userId;
        }

        const realisasiDraftInclude = [];
        if (isAdmin && !realisasiDraftWhere.real_teknisi_id) {
            realisasiDraftInclude.push({
                model: Jadwal,
                as: "real_jadwal",
                attributes: [],
                where: { jdw_divisi: userDivisi },
            });
        }

        const realisasiDraft = await Realisasi.count({
            where: realisasiDraftWhere,
            include: realisasiDraftInclude,
        });

        const unitReplacements = {};
        let unitWhereSql = "";
        if (isSelfOnly) {
            unitWhereSql = " AND j.jdw_assigned_to = :userId";
            unitReplacements.userId = userId;
        } else if (isAdmin) {
            unitWhereSql =
                " AND (j.jdw_divisi = :userDivisi OR j.jdw_assigned_to = :userId)";
            unitReplacements.userDivisi = userDivisi;
            unitReplacements.userId = userId;
        }
        const unitRows = await sequelize.query(
            `
            SELECT COUNT(DISTINCT i.inv_id) AS total_unit_terjadwal
            FROM plan_inventaris i
            JOIN plan_jadwal j ON j.jdw_jenis_id = i.inv_jenis_id
            WHERE i.inv_is_active = 1
              AND j.jdw_status = 'Draft'
              AND (
                j.jdw_pabrik_kode IS NULL 
                OR TRIM(j.jdw_pabrik_kode) = '' 
                OR FIND_IN_SET(i.inv_pabrik_kode, j.jdw_pabrik_kode) > 0
              )
              ${unitWhereSql}
            `,
            {
                replacements: unitReplacements,
                type: QueryTypes.SELECT,
            },
        );

        const totalUnitTerjadwal = Number(
            unitRows?.[0]?.total_unit_terjadwal || 0,
        );

        // Hitung target dan pending tasks
        const todayDate = new Date();
        todayDate.setHours(0, 0, 0, 0);

        const activeJadwalWhere = { jdw_status: "Draft" };
        if (isSelfOnly) {
            activeJadwalWhere.jdw_assigned_to = userId;
        } else if (isAdmin) {
            activeJadwalWhere[Op.or] = [
                { jdw_divisi: userDivisi },
                { jdw_assigned_to: userId },
            ];
        }

        const currentPeriodDoneCount = buildCurrentPeriodDoneCountLiteral();
        const activeJadwalList = await Jadwal.findAll({
            where: activeJadwalWhere,
            attributes: [
                "jdw_id",
                "jdw_judul",
                "jdw_frekuensi",
                "jdw_divisi",
                "jdw_target",
                "jdw_tgl_mulai",
                "jdw_tgl_selesai",
                [
                    sequelize.literal(`(
                        SELECT COUNT(*)
                        FROM plan_inventaris i
                        WHERE i.inv_jenis_id = plan_jadwal.jdw_jenis_id
                          AND i.inv_is_active = 1
                          AND (
                            plan_jadwal.jdw_pabrik_kode IS NULL 
                            OR TRIM(plan_jadwal.jdw_pabrik_kode) = '' 
                            OR FIND_IN_SET(i.inv_pabrik_kode, plan_jadwal.jdw_pabrik_kode) > 0
                          )
                    )`),
                    "jdw_total_unit",
                ],
                [sequelize.literal(currentPeriodDoneCount), "jdw_selesai_unit"],
            ],
        });

        let pendingTasks = 0;
        for (const j of activeJadwalList) {
            const plain = j.get({ plain: true });
            const countdown = calculateJadwalCountdown({
                startDate: plain.jdw_tgl_mulai,
                frekuensi: plain.jdw_frekuensi,
                target: plain.jdw_target,
                selesaiUnit: plain.jdw_selesai_unit,
            });

            let diff = 0;
            const startDate = plain.jdw_tgl_mulai ? new Date(plain.jdw_tgl_mulai) : null;
            if (startDate) startDate.setHours(0, 0, 0, 0);

            if (startDate && startDate > todayDate) {
                diff = Math.floor((startDate - todayDate) / 86400000);
            } else if (!countdown.periodFulfilled && (plain.jdw_frekuensi === 'Mingguan' || plain.jdw_frekuensi === 'Bulanan')) {
                diff = 0;
            } else if (countdown.daysRemaining !== null) {
                diff = countdown.daysRemaining;
            } else {
                const fallbackDateStr = countdown.nextDueDate || plain.jdw_tgl_mulai;
                const fallbackDate = fallbackDateStr ? new Date(fallbackDateStr) : null;
                if (fallbackDate) {
                    fallbackDate.setHours(0, 0, 0, 0);
                    diff = Math.floor((fallbackDate - todayDate) / 86400000);
                } else {
                    diff = 0;
                }
            }

            if (diff <= 0) {
                pendingTasks++;
            }
        }

        const holidays = await getHolidaysForMonth(currentYear, currentMonth);

        const startOfMonth = new Date(currentYear, currentMonth - 1, 1);
        startOfMonth.setHours(0, 0, 0, 0);
        const endOfMonth = new Date(currentYear, currentMonth, 0);
        endOfMonth.setHours(23, 59, 59, 999);

        let totalTargetBulanIni = 0;
        for (const j of activeJadwalList) {
            const plain = j.get({ plain: true });
            const dates = getEffectiveScheduleDatesInMonth(plain, startOfMonth, endOfMonth, holidays);
            const count = dates.length;
            const perTarget = Number(plain.jdw_target || 0) > 0 ? Number(plain.jdw_target) : Number(plain.jdw_total_unit || 0);
            totalTargetBulanIni += count * perTarget;
        }

        return response.ok(res, {
            summary_cards: {
                jadwal_selesai: jadwalSelesai,
                jadwal_aktif: activeJadwalList.length,
                realisasi_hari_ini: realisasiToday,
                realisasi_draft: realisasiDraft,
                total_unit_terjadwal: totalUnitTerjadwal,
                realisasi_bulan_ini: realisasiBulanIni,
                total_target_bulan_ini: totalTargetBulanIni,
                pending_tasks: pendingTasks,
            },
            generated_at: new Date().toISOString(),
        });
    } catch (err) {
        next(err);
    }
};
module.exports = {
    getPabrik,
    getMetadata,
    getDashboardSummary,
    getHolidaysForMonth,
    getEffectiveScheduleDatesInMonth,
};
