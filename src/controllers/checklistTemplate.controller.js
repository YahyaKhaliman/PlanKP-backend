const {
    plan_checklist_template: ChecklistTemplate,
    plan_jenis: Jenis,
    sequelize,
} = require("../models");
const response = require("../utils/response");
const { parsePagination, buildMeta } = require("../utils/pagination");

// GET /checklist-template?jenis=Sewing
const getAll = async (req, res, next) => {
    try {
        const where = { ct_is_active: true };
        if (req.query.jenis) where.ct_jenis_id = req.query.jenis;
        const { hasPagination, limit, offset } = parsePagination(req.query);
        const order = [
            ["ct_jenis_id", "ASC"],
            ["ct_urutan", "ASC"],
        ];
        const include = [];
        if (req.adminScope) {
            include.push({
                model: Jenis,
                as: "ct_jenis",
                attributes: [],
                where: { jenis_kategori: req.adminScope },
            });
        }

        if (!hasPagination) {
            const data = await ChecklistTemplate.findAll({
                where,
                include,
                order,
            });
            return response.ok(res, data);
        }

        const { count, rows } = await ChecklistTemplate.findAndCountAll({
            where,
            include,
            order,
            limit,
            offset,
        });
        return response.ok(res, {
            items: rows,
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

// POST /checklist-template
const create = async (req, res, next) => {
    try {
        const { ct_jenis_id, ct_item, ct_keterangan, ct_urutan } = req.body;
        if (!ct_jenis_id || !ct_item)
            return response.error(
                res,
                "Jenis inventaris dan item wajib diisi",
                400,
            );

        if (req.adminScope) {
            const jenis = await Jenis.findOne({
                where: {
                    jenis_id: ct_jenis_id,
                    jenis_kategori: req.adminScope,
                },
            });
            if (!jenis) {
                return response.error(res, "Jenis di luar scope admin", 403);
            }
        }

        const data = await ChecklistTemplate.create({
            ct_jenis_id,
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

// POST /checklist-template/bulk
// body: { ct_jenis_id: 1, items: [{ ct_item, ct_keterangan }] }
const bulkCreate = async (req, res, next) => {
    const t = await sequelize.transaction();
    try {
        const { ct_jenis_id, items } = req.body;
        if (!ct_jenis_id || !Array.isArray(items) || items.length === 0)
            return response.error(
                res,
                "Jenis dan daftar item wajib diisi",
                400,
            );

        if (req.adminScope) {
            const jenis = await Jenis.findOne({
                where: {
                    jenis_id: ct_jenis_id,
                    jenis_kategori: req.adminScope,
                },
                transaction: t,
            });
            if (!jenis) {
                await t.rollback();
                return response.error(res, "Jenis di luar scope admin", 403);
            }
        }

        // Ambil urutan terakhir untuk jenis ini
        const lastItem = await ChecklistTemplate.findOne({
            where: { ct_jenis_id, ct_is_active: true },
            order: [["ct_urutan", "DESC"]],
            transaction: t,
        });
        let nextUrutan = (lastItem?.ct_urutan ?? 0) + 1;

        const toInsert = items
            .filter((i) => i.ct_item?.trim())
            .map((i) => ({
                ct_jenis_id,
                ct_item: i.ct_item.trim(),
                ct_keterangan: i.ct_keterangan?.trim() || null,
                ct_urutan: nextUrutan++,
                ct_is_active: true,
                ct_created_by: req.user.user_id,
            }));

        if (toInsert.length === 0)
            return response.error(
                res,
                "Tidak ada item valid untuk disimpan",
                400,
            );

        const data = await ChecklistTemplate.bulkCreate(toInsert, {
            transaction: t,
        });
        await t.commit();
        return response.created(
            res,
            data,
            `${data.length} item berhasil ditambahkan ke checklist ${ct_jenis_id}`,
        );
    } catch (err) {
        await t.rollback();
        next(err);
    }
};

// PUT /checklist-template/:id
const update = async (req, res, next) => {
    try {
        const data = await ChecklistTemplate.findByPk(req.params.id);
        if (!data) return response.error(res, "Item tidak ditemukan", 404);
        ["ct_jenis_id", "ct_item", "ct_keterangan", "ct_urutan"].forEach(
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

// DELETE /checklist-template/:id (soft delete)
const remove = async (req, res, next) => {
    try {
        const data = await ChecklistTemplate.findByPk(req.params.id);
        if (!data) return response.error(res, "Item tidak ditemukan", 404);
        data.ct_is_active = false;
        await data.save();
        return response.ok(res, null, "Item checklist dihapus");
    } catch (err) {
        next(err);
    }
};

// GET /checklist-template/jenis
const getJenis = async (req, res, next) => {
    try {
        const rows = await ChecklistTemplate.findAll({
            attributes: [
                [
                    sequelize.fn("DISTINCT", sequelize.col("ct_jenis_id")),
                    "ct_jenis_id",
                ],
            ],
            where: { ct_is_active: true },
            order: [["ct_jenis_id", "ASC"]],
        });
        const list = rows.map((row) => row.ct_jenis_id);
        return response.ok(res, list);
    } catch (err) {
        next(err);
    }
};

module.exports = {
    getAll,
    create,
    bulkCreate,
    update,
    remove,
    getJenis,
};
