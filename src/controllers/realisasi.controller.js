const {
    plan_realisasi: Realisasi,
    plan_hasil_checklist: HasilChecklist,
    plan_jadwal: Jadwal,
    plan_inventaris: Inventaris,
    plan_checklist_template: ChecklistTemplate,
    plan_user: User,
    sequelize,
} = require("../models");
const { Op } = require("sequelize");
const response = require("../utils/response");

// GET /realisasi?jadwal_id=1&status=Draft&bulan=3&tahun=2025
const getAll = async (req, res, next) => {
    try {
        const { jadwal_id, status, bulan, tahun, teknisi_id } = req.query;
        const where = {};
        if (jadwal_id) where.real_jadwal_id = jadwal_id;
        if (status) where.real_status = status;
        if (bulan) where.real_bulan = bulan;
        if (tahun) where.real_tahun = tahun;
        if (teknisi_id) where.real_teknisi_id = teknisi_id;

        // teknisi & it_support hanya lihat realisasi mereka sendiri
        if (["teknisi", "it_support"].includes(req.user.user_jabatan)) {
            where.real_teknisi_id = req.user.user_id;
        }

        const data = await Realisasi.findAll({
            where,
            include: [
                {
                    model: Jadwal,
                    as: "jadwal",
                    attributes: [
                        "jdw_id",
                        "jdw_judul",
                        "jdw_inv_jenis",
                        "jdw_frekuensi",
                    ],
                },
                {
                    model: Inventaris,
                    as: "inventaris",
                    attributes: [
                        "inv_id",
                        "inv_no",
                        "inv_nama",
                        "inv_jenis",
                        "inv_lokasi",
                        "inv_pic",
                    ],
                },
                {
                    model: User,
                    as: "teknisi",
                    attributes: ["user_id", "user_nama"],
                },
            ],
            order: [["real_tgl", "DESC"]],
        });
        return response.ok(res, data);
    } catch (err) {
        next(err);
    }
};

// GET /realisasi/:id  — detail lengkap dengan hasil checklist
const getOne = async (req, res, next) => {
    try {
        const data = await Realisasi.findByPk(req.params.id, {
            include: [
                { model: Jadwal, as: "jadwal" },
                { model: Inventaris, as: "inventaris" },
                {
                    model: User,
                    as: "teknisi",
                    attributes: ["user_id", "user_nama"],
                },
                {
                    model: User,
                    as: "approver",
                    attributes: ["user_id", "user_nama"],
                },
                {
                    model: HasilChecklist,
                    as: "hasil_checklist",
                    include: [
                        {
                            model: ChecklistTemplate,
                            as: "template_item",
                            attributes: [
                                "ct_id",
                                "ct_item",
                                "ct_keterangan",
                                "ct_urutan",
                            ],
                        },
                    ],
                    order: [["hc_ct_id", "ASC"]],
                },
            ],
        });
        if (!data) return response.error(res, "Realisasi tidak ditemukan", 404);
        return response.ok(res, data);
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
        const bulan = tgl.getMonth() + 1;
        const tahun = tgl.getFullYear();
        const weekNo =
            Math.ceil((tgl - new Date(tahun, 0, 1)) / 86400000 / 7) + 1;

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
        real.real_approved_by = req.user.user_id;
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
            where: { ct_inv_jenis: req.params.inv_jenis, ct_is_active: 1 },
            order: [["ct_urutan", "ASC"]],
        });
        return response.ok(res, data);
    } catch (err) {
        next(err);
    }
};

module.exports = {
    getAll,
    getOne,
    create,
    saveChecklist,
    saveTtd,
    getTemplate,
};
