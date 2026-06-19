const { Op, QueryTypes } = require("sequelize");
const {
    sequelize,
    plan_jadwal: Jadwal,
    plan_realisasi: Realisasi,
    plan_jenis: Jenis,
} = require("../models");
const response = require("../utils/response");
const { DIVISI_CANONICAL } = require("../utils/divisi");
const {
    getHolidaysForMonth,
    getEffectiveScheduleDatesInMonth,
} = require("./system.controller");
const { calculateJadwalCountdown } = require("../utils/date-helper");

const getMonitoringDivisi = async (req, res, next) => {
    try {
        const today = new Date();
        const queryBulan = req.query.bulan
            ? parseInt(req.query.bulan)
            : today.getMonth() + 1;
        const queryTahun = req.query.tahun
            ? parseInt(req.query.tahun)
            : today.getFullYear();

        const startOfMonth = new Date(queryTahun, queryBulan - 1, 1);
        startOfMonth.setHours(0, 0, 0, 0);
        const endOfMonth = new Date(queryTahun, queryBulan, 0);
        endOfMonth.setHours(0, 0, 0, 0);

        const startOfMonthStr = `${queryTahun}-${String(queryBulan).padStart(2, "0")}-01`;
        const endOfMonthStr = `${queryTahun}-${String(queryBulan).padStart(2, "0")}-${String(endOfMonth.getDate()).padStart(2, "0")}`;

        // Ambil hari libur untuk bulan ini (sama seperti system.controller)
        const holidays = await getHolidaysForMonth(queryTahun, queryBulan);

        const result = [];

        for (const divisi of DIVISI_CANONICAL) {
            const jenisList = await Jenis.findAll({
                where: {
                    jenis_kategori: divisi,
                    jenis_is_active: 1,
                },
                order: [["jenis_nama", "ASC"]],
            });

            const allJadwalList = await Jadwal.findAll({
                where: {
                    jdw_divisi: divisi,
                    jdw_status: "Draft",
                },
            });

            const currentPeriodDoneCount = `(
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

            // Jadwal yang aktif dalam bulan ini (untuk Progress)
            const monthlyJadwalList = await Jadwal.findAll({
                where: {
                    jdw_divisi: divisi,
                    jdw_status: "Draft",
                    jdw_tgl_mulai: { [Op.lte]: endOfMonthStr },
                    [Op.or]: [
                        { jdw_tgl_selesai: null },
                        { jdw_tgl_selesai: { [Op.gte]: startOfMonthStr } },
                    ],
                },
                attributes: [
                    "jdw_id",
                    "jdw_judul",
                    "jdw_jenis_id",
                    "jdw_frekuensi",
                    "jdw_target",
                    "jdw_tgl_mulai",
                    "jdw_tgl_selesai",
                    "jdw_pabrik_kode",
                    "jdw_status",
                    // Hitung total unit inventaris aktif (dengan filter pabrik)
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
                include: [
                    {
                        model: Realisasi,
                        as: "plan_realisasis",
                        where: {
                            real_status: "Selesai",
                            real_bulan: queryBulan,
                            real_tahun: queryTahun,
                        },
                        required: false,
                    },
                ],
            });

            let jenisDijadwalkanCount = 0;
            const detailJenis = [];

            for (const jen of jenisList) {
                // Untuk Penjadwalan (global)
                const allJadwalTerkait = allJadwalList.filter(
                    (j) => j.jdw_jenis_id === jen.jenis_id,
                );
                const sudahDijadwalkan = allJadwalTerkait.length > 0;

                if (sudahDijadwalkan) {
                    jenisDijadwalkanCount++;
                }

                const detailAllJadwal = allJadwalTerkait.map((j) => ({
                    jdw_id: j.jdw_id,
                    jdw_judul: j.jdw_judul,
                    jdw_frekuensi: j.jdw_frekuensi,
                    jdw_tgl_mulai: j.jdw_tgl_mulai,
                }));

                // Untuk Progress (bulanan) — konsisten dengan realisasi_history_screen
                const monthlyJadwalTerkait = monthlyJadwalList.filter(
                    (j) => j.jdw_jenis_id === jen.jenis_id,
                );
                const detailMonthlyJadwal = monthlyJadwalTerkait.map((j) => {
                    const plain = j.get({ plain: true });

                    // Hitung jumlah kemunculan jadwal dalam bulan (sesuai frekuensi & hari libur)
                    const appearances = getEffectiveScheduleDatesInMonth(
                        plain, startOfMonth, endOfMonth, holidays,
                    ).length;

                    // Target per kemunculan: jdw_target, fallback ke total unit inventaris
                    const perTarget =
                        Number(plain.jdw_target || 0) > 0
                            ? Number(plain.jdw_target)
                            : Number(plain.jdw_total_unit || 0);

                    // Total target bulanan = kemunculan × target per kemunculan
                    const target = appearances * perTarget;

                    // Realisasi = jumlah baris realisasi selesai bulan ini
                    const realisasi = plain.plan_realisasis
                        ? plain.plan_realisasis.length
                        : 0;

                    const persen =
                        target > 0
                            ? Math.min(
                                  100,
                                  Math.round((realisasi / target) * 100),
                              )
                            : 0;

                    // Hitung countdown period untuk mengecek periodFulfilled
                    const countdown = calculateJadwalCountdown({
                        startDate: plain.jdw_tgl_mulai,
                        frekuensi: plain.jdw_frekuensi,
                        target: plain.jdw_target,
                        selesaiUnit: plain.jdw_selesai_unit,
                    });

                    return {
                        jdw_id: plain.jdw_id,
                        jdw_judul: plain.jdw_judul,
                        jdw_frekuensi: plain.jdw_frekuensi,
                        jdw_target: target,
                        jdw_target_per_period: perTarget,
                        jdw_appearances: appearances,
                        jdw_realisasi: realisasi,
                        jdw_persen: persen,
                        jdw_status: plain.jdw_status,
                        jdw_tgl_mulai: plain.jdw_tgl_mulai,
                        jdw_period_fulfilled: countdown.periodFulfilled,
                    };
                });

                detailJenis.push({
                    jenis_id: jen.jenis_id,
                    jenis_nama: jen.jenis_nama,
                    sudah_dijadwalkan: sudahDijadwalkan,
                    all_jadwal: detailAllJadwal,
                    jadwal: detailMonthlyJadwal,
                });
            }

            const totalJenis = jenisList.length;
            const progressPersen =
                totalJenis > 0
                    ? Math.round((jenisDijadwalkanCount / totalJenis) * 100)
                    : 0;
            const sudahDibuatSemua =
                totalJenis > 0 && jenisDijadwalkanCount === totalJenis;

            result.push({
                divisi,
                total_jenis: totalJenis,
                jenis_dijadwalkan: jenisDijadwalkanCount,
                progress_persen: progressPersen,
                sudah_dibuat_semua: sudahDibuatSemua,
                jenis_list: detailJenis,
            });
        }

        return response.ok(res, {
            bulan: queryBulan,
            tahun: queryTahun,
            data: result,
        });
    } catch (err) {
        next(err);
    }
};

module.exports = {
    getMonitoringDivisi,
};
