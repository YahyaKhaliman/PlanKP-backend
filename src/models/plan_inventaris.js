const Sequelize = require("sequelize");
module.exports = function (sequelize, DataTypes) {
    return sequelize.define(
        "plan_inventaris",
        {
            inv_id: {
                autoIncrement: true,
                type: DataTypes.INTEGER,
                allowNull: false,
                primaryKey: true,
            },
            inv_no: {
                type: DataTypes.STRING(50),
                allowNull: false,
                unique: "uq_inv_no",
            },
            inv_nama: {
                type: DataTypes.STRING(150),
                allowNull: false,
            },
            inv_kategori: {
                type: DataTypes.ENUM(
                    "Mesin Jahit",
                    "Mesin Umum",
                    "Hardware",
                    "APAR",
                ),
                allowNull: false,
            },
            inv_jenis: {
                type: DataTypes.STRING(100),
                allowNull: false,
            },
            inv_lokasi: {
                type: DataTypes.STRING(100),
                allowNull: true,
            },
            inv_merk: {
                type: DataTypes.STRING(100),
                allowNull: true,
            },
            inv_serial_number: {
                type: DataTypes.STRING(100),
                allowNull: true,
            },
            inv_pic: {
                type: DataTypes.INTEGER,
                allowNull: true,
                references: {
                    model: "plan_user",
                    key: "user_id",
                },
            },
            inv_tgl_beli: {
                type: DataTypes.DATEONLY,
                allowNull: true,
            },
            inv_kondisi: {
                type: DataTypes.ENUM("Baik", "Perlu Perhatian", "Rusak"),
                allowNull: false,
                defaultValue: "Baik",
            },
            inv_is_active: {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: 1,
            },
            inv_notes: {
                type: DataTypes.TEXT,
                allowNull: true,
            },
            inv_created_at: {
                type: DataTypes.DATE,
                allowNull: false,
                defaultValue: Sequelize.Sequelize.literal("CURRENT_TIMESTAMP"),
            },
            inv_updated_at: {
                type: DataTypes.DATE,
                allowNull: false,
                defaultValue: Sequelize.Sequelize.literal("CURRENT_TIMESTAMP"),
            },
        },
        {
            sequelize,
            tableName: "plan_inventaris",
            timestamps: false,
            indexes: [
                {
                    name: "PRIMARY",
                    unique: true,
                    using: "BTREE",
                    fields: [{ name: "inv_id" }],
                },
                {
                    name: "uq_inv_no",
                    unique: true,
                    using: "BTREE",
                    fields: [{ name: "inv_no" }],
                },
                {
                    name: "idx_inv_kategori",
                    using: "BTREE",
                    fields: [{ name: "inv_kategori" }],
                },
                {
                    name: "idx_inv_jenis",
                    using: "BTREE",
                    fields: [{ name: "inv_jenis" }],
                },
                {
                    name: "idx_inv_active",
                    using: "BTREE",
                    fields: [{ name: "inv_is_active" }],
                },
            ],
        },
    );
};
