const { plan_jenis: Jenis } = require("../models");
const response = require("../utils/response");

const parseGapHari = (value) => {
    if (value === undefined || value === null || value === "") return 0;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 0) return null;
    return parsed;
};

const getAll = async (req, res, next) => {
    try {
        const { kategori, aktif } = req.query;
        const where = {};
        if (kategori) where.jenis_kategori = kategori;
        if (aktif !== undefined)
            where.jenis_is_active = aktif === "true" ? 1 : 0;
        // admin hanya lihat jenis dalam scope divisinya
        if (req.adminScope) {
            where.jenis_kategori = req.adminScope;
        }
        const data = await Jenis.findAll({
            where,
            order: [["jenis_nama", "ASC"]],
        });
        return response.ok(res, data);
    } catch (err) {
        next(err);
    }
};

const create = async (req, res, next) => {
    try {
        const { jenis_nama } = req.body;
        const jenis_gap_hari = parseGapHari(req.body.jenis_gap_hari);
        // kategori diambil dari scope user (admin scope) atau dari body (superadmin)
        const jenis_kategori = req.adminScope || req.body.jenis_kategori;
        if (!jenis_nama || !jenis_kategori)
            return response.error(res, "Nama dan kategori wajib diisi", 400);
        if (jenis_gap_hari === null) {
            return response.error(
                res,
                "Gap hari wajib berupa angka bulat >= 0",
                400,
            );
        }
        const exists = await Jenis.findOne({ where: { jenis_nama } });
        if (exists)
            return response.error(res, "Nama jenis sudah digunakan", 400);
        const data = await Jenis.create({
            jenis_nama,
            jenis_kategori,
            jenis_gap_hari,
        });
        return response.created(res, data, "Jenis berhasil ditambahkan");
    } catch (err) {
        next(err);
    }
};

const update = async (req, res, next) => {
    try {
        const data = await Jenis.findByPk(req.params.id);
        if (!data) return response.error(res, "Jenis tidak ditemukan", 404);
        if (req.adminScope && data.jenis_kategori !== req.adminScope) {
            return response.error(res, "Jenis di luar scope admin", 403);
        }
        const fields = [
            "jenis_nama",
            "jenis_kategori",
            "jenis_is_active",
            "jenis_gap_hari",
        ];
        fields.forEach((f) => {
            if (req.body[f] !== undefined) data[f] = req.body[f];
        });
        if (req.body.jenis_gap_hari !== undefined) {
            const jenis_gap_hari = parseGapHari(req.body.jenis_gap_hari);
            if (jenis_gap_hari === null) {
                return response.error(
                    res,
                    "Gap hari wajib berupa angka bulat >= 0",
                    400,
                );
            }
            data.jenis_gap_hari = jenis_gap_hari;
        }
        if (req.adminScope) {
            data.jenis_kategori = req.adminScope;
        }
        await data.save();
        return response.ok(res, data, "Jenis berhasil diupdate");
    } catch (err) {
        next(err);
    }
};

const remove = async (req, res, next) => {
    try {
        const data = await Jenis.findByPk(req.params.id);
        if (!data) return response.error(res, "Jenis tidak ditemukan", 404);
        await data.destroy();
        return response.ok(res, null, "Jenis berhasil dihapus");
    } catch (err) {
        next(err);
    }
};

module.exports = { getAll, create, update, remove };
