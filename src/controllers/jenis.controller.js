const { plan_jenis: Jenis } = require("../models");
const response = require("../utils/response");

const getAll = async (req, res, next) => {
    try {
        const { kategori, aktif } = req.query;
        const where = {};
        if (kategori) where.jenis_kategori = kategori;
        if (aktif !== undefined)
            where.jenis_is_active = aktif === "true" ? 1 : 0;
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
        const { jenis_nama, jenis_kategori } = req.body;
        if (!jenis_nama || !jenis_kategori)
            return response.error(res, "Nama dan kategori wajib diisi", 400);
        const exists = await Jenis.findOne({ where: { jenis_nama } });
        if (exists)
            return response.error(res, "Nama jenis sudah digunakan", 400);
        const data = await Jenis.create({ jenis_nama, jenis_kategori });
        return response.created(res, data, "Jenis berhasil ditambahkan");
    } catch (err) {
        next(err);
    }
};

const update = async (req, res, next) => {
    try {
        const data = await Jenis.findByPk(req.params.id);
        if (!data) return response.error(res, "Jenis tidak ditemukan", 404);
        const fields = ["jenis_nama", "jenis_kategori", "jenis_is_active"];
        fields.forEach((f) => {
            if (req.body[f] !== undefined) data[f] = req.body[f];
        });
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
