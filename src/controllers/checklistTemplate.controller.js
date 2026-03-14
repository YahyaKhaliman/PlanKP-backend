const { ChecklistTemplate } = require("../models");
const response = require("../utils/response");

// GET /checklist-template?jenis=Sewing
const getAll = async (req, res, next) => {
    try {
        const where = { ct_is_active: 1 };
        if (req.query.jenis) where.ct_inv_jenis = req.query.jenis;
        const data = await ChecklistTemplate.findAll({
            where,
            order: [
                ["ct_inv_jenis", "ASC"],
                ["ct_urutan", "ASC"],
            ],
        });
        return response.ok(res, data);
    } catch (err) {
        next(err);
    }
};

// POST /checklist-template
const create = async (req, res, next) => {
    try {
        const { ct_inv_jenis, ct_item, ct_keterangan, ct_urutan } = req.body;
        if (!ct_inv_jenis || !ct_item) {
            return response.error(
                res,
                "Jenis inventaris dan item wajib diisi",
                400,
            );
        }
        const data = await ChecklistTemplate.create({
            ct_inv_jenis,
            ct_item,
            ct_keterangan,
            ct_urutan: ct_urutan ?? 1,
            ct_created_by: req.user.user_id,
        });
        return response.created(
            res,
            data,
            "Item checklist berhasil ditambahkan",
        );
    } catch (err) {
        next(err);
    }
};

// PUT /checklist-template/:id
const update = async (req, res, next) => {
    try {
        const data = await ChecklistTemplate.findByPk(req.params.id);
        if (!data) return response.error(res, "Item tidak ditemukan", 404);
        ["ct_inv_jenis", "ct_item", "ct_keterangan", "ct_urutan"].forEach(
            (f) => {
                if (req.body[f] !== undefined) data[f] = req.body[f];
            },
        );
        await data.save();
        return response.ok(res, data, "Item checklist berhasil diupdate");
    } catch (err) {
        next(err);
    }
};

// DELETE /checklist-template/:id  (soft delete)
const remove = async (req, res, next) => {
    try {
        const data = await ChecklistTemplate.findByPk(req.params.id);
        if (!data) return response.error(res, "Item tidak ditemukan", 404);
        data.ct_is_active = 0;
        await data.save();
        return response.ok(res, null, "Item checklist dihapus");
    } catch (err) {
        next(err);
    }
};

module.exports = { getAll, create, update, remove };
