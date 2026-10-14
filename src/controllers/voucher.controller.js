const { Op } = require("sequelize");
const {
    plan_voucher,
    plan_spbu,
    plan_inventaris,
    plan_user,
    plan_jadwal,
    plan_realisasi,
} = require("../models");
const response = require("../utils/response");

const BBM_TYPES = ["Pertalite", "Pertamax", "Solar", "Dexlite"];

/**
 * Mendapatkan daftar jenis BBM yang didukung
 */
exports.getBbmTypes = (req, res) => {
    return response.ok(res, BBM_TYPES, "Daftar jenis BBM");
};

/**
 * Mendapatkan daftar SPBU aktif
 */
exports.getSpbuList = async (req, res, next) => {
    try {
        const list = await plan_spbu.findAll({
            where: { spbu_is_active: 1 },
            order: [["spbu_nama", "ASC"]],
        });
        return response.ok(res, list, "Daftar SPBU aktif");
    } catch (err) {
        next(err);
    }
};

/**
 * Mendapatkan daftar inventaris yang eligible untuk diajukan voucher:
 * Syarat:
 * 1. Terikat pada jadwal yang aktif pada hari ini
 * 2. Jadwal tersebut di-assign kepada user (driver) yang bersangkutan
 * 3. Jadwal tersebut minimal sudah pernah 1 kali dilakukan realisasi
 */
exports.getEligibleInventaris = async (req, res, next) => {
    try {
        const isManagerOrAdmin = ["admin", "manager"].includes(
            req.user.user_jabatan,
        );
        let targetUserId = req.user.user_id;

        if (isManagerOrAdmin && req.query.user_id) {
            targetUserId = parseInt(req.query.user_id, 10);
        }

        // Tanggal hari ini (YYYY-MM-DD)
        const today = new Date().toISOString().slice(0, 10);

        // 1. Cari jadwal aktif hari ini yang diarahkan ke targetUserId
        const jadwals = await plan_jadwal.findAll({
            where: {
                jdw_assigned_to: targetUserId,
                jdw_status: "Aktif",
                jdw_tgl_mulai: { [Op.lte]: today },
                [Op.or]: [
                    { jdw_tgl_selesai: null },
                    { jdw_tgl_selesai: { [Op.gte]: today } },
                ],
            },
            attributes: ["jdw_id", "jdw_judul"],
        });

        if (!jadwals.length) {
            return response.ok(
                res,
                [],
                "Tidak ada jadwal aktif untuk user pada hari ini",
            );
        }

        const jadwalIds = jadwals.map((j) => j.jdw_id);

        // 2. Cari realisasi yang sudah ada pada jadwal-jadwal tersebut dan berstatus 'Selesai'
        const realisasis = await plan_realisasi.findAll({
            where: {
                real_jadwal_id: { [Op.in]: jadwalIds },
                real_status: "Selesai",
            },
            attributes: ["real_inv_id"],
            include: [
                {
                    model: plan_inventaris,
                    as: "real_inv",
                    where: { inv_is_active: 1 },
                    attributes: [
                        "inv_id",
                        "inv_no",
                        "inv_nama",
                        "inv_merk",
                        "inv_serial_number",
                        "inv_kondisi",
                    ],
                },
            ],
        });

        // Kumpulkan inventaris unik
        const invMap = new Map();
        realisasis.forEach((r) => {
            if (r.real_inv && !invMap.has(r.real_inv.inv_id)) {
                invMap.set(r.real_inv.inv_id, r.real_inv);
            }
        });

        const eligibleList = Array.from(invMap.values());
        return response.ok(
            res,
            eligibleList,
            "Daftar inventaris eligible untuk voucher BBM",
        );
    } catch (err) {
        next(err);
    }
};

/**
 * Pengajuan Voucher BBM baru
 */
exports.createVoucher = async (req, res, next) => {
    try {
        const isManagerOrAdmin = ["admin", "manager"].includes(
            req.user.user_jabatan,
        );

        // Validasi divisi DRIVER jika bukan admin/manager
        if (!isManagerOrAdmin) {
            const divisi = (req.user.user_divisi || "").toUpperCase();
            if (divisi !== "DRIVER") {
                return response.error(
                    res,
                    "Pengajuan voucher BBM hanya dapat dilakukan oleh divisi DRIVER",
                    403,
                );
            }
        }

        const {
            voucher_inv_id,
            voucher_spbu_id,
            voucher_jenis_bbm,
            voucher_jumlah_liter,
            voucher_odometer,
            user_id_target,
        } = req.body;

        if (
            !voucher_inv_id ||
            !voucher_spbu_id ||
            !voucher_jenis_bbm ||
            !voucher_jumlah_liter
        ) {
            return response.error(
                res,
                "Inventaris, SPBU, jenis BBM, dan jumlah liter wajib diisi",
                400,
            );
        }

        if (!BBM_TYPES.includes(voucher_jenis_bbm)) {
            return response.error(
                res,
                `Jenis BBM tidak valid. Pilihan: ${BBM_TYPES.join(", ")}`,
                400,
            );
        }

        const invId = parseInt(voucher_inv_id, 10);
        const spbuId = parseInt(voucher_spbu_id, 10);
        if (isNaN(invId) || isNaN(spbuId)) {
            return response.error(
                res,
                "ID Inventaris dan SPBU harus berupa angka",
                400,
            );
        }

        const liter = parseFloat(voucher_jumlah_liter);
        if (isNaN(liter) || liter <= 0) {
            return response.error(
                res,
                "Jumlah liter harus berupa angka lebih dari 0",
                400,
            );
        }
        if (liter > 100) {
            return response.error(
                res,
                "Jumlah liter maksimal 100 liter",
                400,
            );
        }

        let parsedOdometer = null;
        if (
            voucher_odometer !== undefined &&
            voucher_odometer !== null &&
            String(voucher_odometer).trim() !== ""
        ) {
            const num = parseInt(voucher_odometer, 10);
            if (isNaN(num) || num < 0) {
                return response.error(
                    res,
                    "Nilai odometer harus berupa angka bulat positif",
                    400,
                );
            }
            parsedOdometer = num;
        }

        // Tentukan pemohon
        const pemohonId =
            isManagerOrAdmin && user_id_target
                ? parseInt(user_id_target, 10)
                : req.user.user_id;

        // Validasi apakah inventaris eligible untuk pemohon hari ini
        const today = new Date().toISOString().slice(0, 10);
        const jadwals = await plan_jadwal.findAll({
            where: {
                jdw_assigned_to: pemohonId,
                jdw_status: "Aktif",
                jdw_tgl_mulai: { [Op.lte]: today },
                [Op.or]: [
                    { jdw_tgl_selesai: null },
                    { jdw_tgl_selesai: { [Op.gte]: today } },
                ],
            },
            attributes: ["jdw_id"],
        });

        if (!jadwals.length) {
            return response.error(
                res,
                "User tidak memiliki jadwal aktif pada hari ini",
                400,
            );
        }

        const jadwalIds = jadwals.map((j) => j.jdw_id);
        const hasRealisasi = await plan_realisasi.findOne({
            where: {
                real_jadwal_id: { [Op.in]: jadwalIds },
                real_inv_id: invId,
                real_status: "Selesai",
            },
        });

        if (!hasRealisasi) {
            return response.error(
                res,
                "Inventaris ini belum memiliki realisasi dengan status 'Selesai' pada jadwal aktif user hari ini",
                400,
            );
        }

        // Cek SPBU
        const spbu = await plan_spbu.findByPk(spbuId);
        if (!spbu || !spbu.spbu_is_active) {
            return response.error(res, "SPBU tidak ditemukan atau tidak aktif", 400);
        }

        // Simpan data voucher baru
        const newVoucher = await plan_voucher.create({
            voucher_no_bon: null,
            voucher_user_id: pemohonId,
            voucher_inv_id: invId,
            voucher_spbu_id: spbuId,
            voucher_jenis_bbm,
            voucher_jumlah_liter: liter,
            voucher_odometer: parsedOdometer,
            voucher_status: "Menunggu",
        });

        return response.created(
            res,
            newVoucher,
            "Permintaan voucher BBM berhasil diajukan",
        );
    } catch (err) {
        next(err);
    }
};

/**
 * Mengambil daftar rekapitulasi Voucher
 */
exports.getVouchers = async (req, res, next) => {
    try {
        const isManager = req.user.user_jabatan === "manager";
        const isAdmin = req.user.user_jabatan === "admin";
        const isManagerOrAdmin = isManager || isAdmin;
        const { status, limit = 50, page = 1, divisi } = req.query;

        const where = {};

        // Driver hanya melihat vouchernya sendiri
        if (!isManagerOrAdmin) {
            where.voucher_user_id = req.user.user_id;
        }

        if (status && status !== "Semua") {
            where.voucher_status = status;
        }

        const pemohonWhere = {};
        // Manager bisa melihat semua; Admin divisi tertentu (misal driver) hanya melihat divisinya
        if (isAdmin && req.user.user_divisi) {
            pemohonWhere.user_divisi = req.user.user_divisi;
        } else if (isManager && divisi && divisi !== "Semua") {
            pemohonWhere.user_divisi = divisi;
        }

        const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

        const { count, rows } = await plan_voucher.findAndCountAll({
            where,
            include: [
                {
                    model: plan_user,
                    as: "pemohon",
                    attributes: ["user_id", "user_nama", "user_nik", "user_divisi"],
                    where: Object.keys(pemohonWhere).length > 0 ? pemohonWhere : undefined,
                    required: Object.keys(pemohonWhere).length > 0,
                },
                {
                    model: plan_inventaris,
                    as: "inventaris",
                    attributes: [
                        "inv_id",
                        "inv_no",
                        "inv_nama",
                        "inv_merk",
                        "inv_serial_number",
                    ],
                },
                {
                    model: plan_spbu,
                    as: "spbu",
                    attributes: ["spbu_id", "spbu_nama", "spbu_alamat"],
                },
                {
                    model: plan_user,
                    as: "approver",
                    attributes: ["user_id", "user_nama", "user_jabatan"],
                },
            ],
            order: [["voucher_created_at", "DESC"]],
            limit: parseInt(limit, 10),
            offset,
        });

        return response.ok(
            res,
            {
                total: count,
                page: parseInt(page, 10),
                totalPages: Math.ceil(count / parseInt(limit, 10)),
                items: rows,
            },
            "Daftar voucher BBM",
        );
    } catch (err) {
        next(err);
    }
};

/**
 * Mengambil detail 1 voucher
 */
exports.getVoucherDetail = async (req, res, next) => {
    try {
        const { id } = req.params;
        const voucher = await plan_voucher.findByPk(id, {
            include: [
                {
                    model: plan_user,
                    as: "pemohon",
                    attributes: ["user_id", "user_nama", "user_nik", "user_divisi"],
                },
                {
                    model: plan_inventaris,
                    as: "inventaris",
                    attributes: [
                        "inv_id",
                        "inv_no",
                        "inv_nama",
                        "inv_merk",
                        "inv_serial_number",
                    ],
                },
                {
                    model: plan_spbu,
                    as: "spbu",
                    attributes: ["spbu_id", "spbu_nama", "spbu_alamat"],
                },
                {
                    model: plan_user,
                    as: "approver",
                    attributes: ["user_id", "user_nama", "user_jabatan"],
                },
            ],
        });

        if (!voucher) {
            return response.error(res, "Voucher tidak ditemukan", 404);
        }

        const isManagerOrAdmin = ["admin", "manager"].includes(
            req.user.user_jabatan,
        );
        if (!isManagerOrAdmin && voucher.voucher_user_id !== req.user.user_id) {
            return response.error(res, "Akses ditolak", 403);
        }

        return response.ok(res, voucher, "Detail voucher");
    } catch (err) {
        next(err);
    }
};

/**
 * Approval voucher oleh Admin (menginput nomor bon fisik & penyesuaian jika ada)
 */
exports.approveVoucher = async (req, res, next) => {
    try {
        const { id } = req.params;
        const {
            voucher_no_bon,
            voucher_spbu_id,
            voucher_jenis_bbm,
            voucher_jumlah_liter,
        } = req.body;

        if (!voucher_no_bon || !String(voucher_no_bon).trim()) {
            return response.error(
                res,
                "Nomor bon fisik kertas wajib diisi oleh Admin",
                400,
            );
        }

        const voucher = await plan_voucher.findByPk(id);
        if (!voucher) {
            return response.error(res, "Voucher tidak ditemukan", 404);
        }

        if (voucher.voucher_status !== "Menunggu") {
            return response.error(
                res,
                `Voucher sudah berstatus '${voucher.voucher_status}'`,
                400,
            );
        }

        const updateData = {
            voucher_no_bon: String(voucher_no_bon).trim(),
            voucher_status: "Disetujui",
            voucher_approved_by: req.user.user_id,
            voucher_approved_at: new Date(),
        };

        // Jika admin mengubah SPBU
        if (voucher_spbu_id) {
            const spbu = await plan_spbu.findByPk(voucher_spbu_id);
            if (spbu) updateData.voucher_spbu_id = voucher_spbu_id;
        }

        // Jika admin mengubah jenis BBM
        if (voucher_jenis_bbm && BBM_TYPES.includes(voucher_jenis_bbm)) {
            updateData.voucher_jenis_bbm = voucher_jenis_bbm;
        }

        // Jika admin mengubah jumlah liter
        if (voucher_jumlah_liter !== undefined && voucher_jumlah_liter !== null) {
            const literParsed = parseFloat(voucher_jumlah_liter);
            if (isNaN(literParsed) || literParsed <= 0) {
                return response.error(res, "Jumlah liter tidak valid", 400);
            }
            if (literParsed > 100) {
                return response.error(
                    res,
                    "Jumlah liter maksimal 100 liter",
                    400,
                );
            }
            updateData.voucher_jumlah_liter = literParsed;
        }

        await voucher.update(updateData);

        return response.ok(
            res,
            voucher,
            "Voucher berhasil disetujui & nomor bon fisik tercatat",
        );
    } catch (err) {
        next(err);
    }
};

/**
 * Tolak voucher oleh Admin
 */
exports.rejectVoucher = async (req, res, next) => {
    try {
        const { id } = req.params;
        const voucher = await plan_voucher.findByPk(id);
        if (!voucher) {
            return response.error(res, "Voucher tidak ditemukan", 404);
        }

        if (voucher.voucher_status !== "Menunggu") {
            return response.error(
                res,
                `Voucher sudah berstatus '${voucher.voucher_status}'`,
                400,
            );
        }

        await voucher.update({
            voucher_status: "Ditolak",
            voucher_approved_by: req.user.user_id,
            voucher_approved_at: new Date(),
        });

        return response.ok(res, voucher, "Voucher telah ditolak");
    } catch (err) {
        next(err);
    }
};
