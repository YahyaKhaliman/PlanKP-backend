const { Op, QueryTypes } = require("sequelize");
const {
    sequelize,
    plan_jadwal: Jadwal,
    plan_realisasi: Realisasi,
    plan_jenis: Jenis,
    tpabrik: Pabrik,
} = require("../models");
const response = require("../utils/response");
const { normalizeDivisi, DIVISI_CANONICAL } = require("../utils/divisi");

const JENIS_KATEGORI = DIVISI_CANONICAL;
const JADWAL_FREKUENSI = ["Harian", "Mingguan", "Bulanan"];
const JADWAL_STATUS = ["Draft", "Selesai"];
const REALISASI_STATUS = ["Draft", "Selesai"];
const KONDISI_LIST = ["Baik", "Perlu Perhatian", "Rusak"];

const getPabrik = async (req, res, next) => {
    try {
        const data = await Pabrik.findAll({
            attributes: ["pab_kode", "pab_nama", "pab_alamat", "pab_pabrik"],
            order: [["pab_kode", "ASC"]],
        });
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
                attributes: ["jenis_id", "jenis_nama", "jenis_kategori"],
                order: [["jenis_nama", "ASC"]],
            }),
            Pabrik.findAll({
                attributes: [
                    "pab_kode",
                    "pab_nama",
                    "pab_alamat",
                    "pab_pabrik",
                ],
                order: [["pab_kode", "ASC"]],
            }),
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
        const isAdmin =
            String(req.user.user_jabatan || "").toLowerCase() === "admin";
        const userId = req.user.user_id;
        const userDivisi =
            normalizeDivisi(req.user.user_divisi) || req.user.user_divisi;
        const scopeDivisi = userDivisi;
        const today = new Date().toISOString().split("T")[0];

        const userRole = (req.user.user_jabatan || "").toLowerCase();
        const limitRealisasiBySelf = !isAdmin && userRole === "user";

        const jadwalWhere = { jdw_status: "Selesai" };
        if (limitRealisasiBySelf) {
            jadwalWhere.jdw_assigned_to = userId;
        } else if (!isAdmin) {
            jadwalWhere[Op.or] = [
                { jdw_divisi: userDivisi },
                { jdw_assigned_to: userId },
            ];
        }

        const jadwalSelesai = await Jadwal.count({ where: jadwalWhere });

        const realisasiTodayWhere = { real_tgl: today };
        if (["teknisi", "it_support"].includes(req.user.user_jabatan)) {
            realisasiTodayWhere.real_teknisi_id = userId;
        } else if (limitRealisasiBySelf) {
            realisasiTodayWhere.real_teknisi_id = userId;
        }

        const realisasiToday = await Realisasi.count({
            where: realisasiTodayWhere,
            include:
                !isAdmin && !realisasiTodayWhere.real_teknisi_id
                    ? [
                          {
                              model: Jadwal,
                              as: "real_jadwal",
                              attributes: [],
                              where: { jdw_divisi: scopeDivisi },
                          },
                      ]
                    : [],
        });

        const realisasiDraftWhere = { real_status: "Draft" };
        if (limitRealisasiBySelf) {
            realisasiDraftWhere.real_teknisi_id = userId;
        }

        const realisasiDraft = await Realisasi.count({
            where: realisasiDraftWhere,
            include:
                !limitRealisasiBySelf && !isAdmin
                    ? [
                          {
                              model: Jadwal,
                              as: "real_jadwal",
                              attributes: [],
                              where: { jdw_divisi: scopeDivisi },
                          },
                      ]
                    : [],
        });

        const unitReplacements = {};
        let unitWhereSql = "";
        if (limitRealisasiBySelf) {
            unitWhereSql = " AND j.jdw_assigned_to = :userId";
            unitReplacements.userId = userId;
        } else if (!isAdmin) {
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
              AND j.jdw_status = 'Selesai'
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

        return response.ok(res, {
            summary_cards: {
                jadwal_selesai: jadwalSelesai,
                realisasi_hari_ini: realisasiToday,
                realisasi_draft: realisasiDraft,
                total_unit_terjadwal: totalUnitTerjadwal,
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
};
