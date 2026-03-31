const Sequelize = require("sequelize");
module.exports = function (sequelize, DataTypes) {
    return sequelize.define(
        "plan_jenis",
        {
            jenis_id: {
                autoIncrement: true,
                type: DataTypes.INTEGER,
                allowNull: false,
                primaryKey: true,
            },
            jenis_nama: {
                type: DataTypes.STRING(100),
                allowNull: false,
                unique: "uq_jenis_nama",
            },
            jenis_kategori: {
                type: DataTypes.STRING(50),
                allowNull: false,
            },
            jenis_is_active: {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: 1,
            },
            jenis_created_at: {
                type: DataTypes.DATE,
                allowNull: false,
                defaultValue: Sequelize.Sequelize.literal("CURRENT_TIMESTAMP"),
            },
        },
        {
            sequelize,
            tableName: "plan_jenis",
            timestamps: false,
            indexes: [
                {
                    name: "PRIMARY",
                    unique: true,
                    using: "BTREE",
                    fields: [{ name: "jenis_id" }],
                },
                {
                    name: "uq_jenis_nama",
                    unique: true,
                    using: "BTREE",
                    fields: [{ name: "jenis_nama" }],
                },
                {
                    name: "idx_jenis_kategori",
                    using: "BTREE",
                    fields: [{ name: "jenis_kategori" }],
                },
            ],
        },
    );
};
