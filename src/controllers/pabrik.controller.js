const { sequelize } = require("../models");
const response = require("../utils/response");

// GET /master/pabrik
const getAll = async (req, res, next) => {
    try {
        const [rows] = await sequelize.query(
            "SELECT pab_kode, pab_nama, pab_alamat FROM tpabrik ORDER BY pab_kode ASC",
        );
        return response.ok(res, rows);
    } catch (err) {
        next(err);
    }
};

module.exports = { getAll };
