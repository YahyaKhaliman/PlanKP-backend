const Sequelize = require("sequelize");

module.exports = function (sequelize, DataTypes) {
    return sequelize.define(
        "plan_voucher",
        {
            voucher_id: {
                autoIncrement: true,
                type: DataTypes.INTEGER,
                allowNull: false,
                primaryKey: true,
            },
            voucher_no_bon: {
                type: DataTypes.STRING(50),
                allowNull: true,
                comment: "Nomor seri bon fisik kertas (misal: 998, 5942)",
            },
            voucher_user_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
                references: {
                    model: "plan_user",
                    key: "user_id",
                },
            },
            voucher_inv_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
                references: {
                    model: "plan_inventaris",
                    key: "inv_id",
                },
            },
            voucher_spbu_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
                references: {
                    model: "plan_spbu",
                    key: "spbu_id",
                },
            },
            voucher_jenis_bbm: {
                type: DataTypes.STRING(50),
                allowNull: false,
                defaultValue: "Pertalite",
            },
            voucher_jumlah_liter: {
                type: DataTypes.DECIMAL(10, 2),
                allowNull: false,
            },
            voucher_odometer: {
                type: DataTypes.INTEGER,
                allowNull: true,
                comment: "KM Odometer saat pengajuan",
            },
            voucher_status: {
                type: DataTypes.ENUM(
                    "Menunggu",
                    "Disetujui",
                    "Ditolak",
                    "Selesai",
                ),
                allowNull: false,
                defaultValue: "Menunggu",
            },
            voucher_approved_by: {
                type: DataTypes.INTEGER,
                allowNull: true,
                references: {
                    model: "plan_user",
                    key: "user_id",
                },
            },
            voucher_approved_at: {
                type: DataTypes.DATE,
                allowNull: true,
            },
            voucher_created_at: {
                type: DataTypes.DATE,
                allowNull: false,
                defaultValue: Sequelize.Sequelize.literal("CURRENT_TIMESTAMP"),
            },
            voucher_updated_at: {
                type: DataTypes.DATE,
                allowNull: false,
                defaultValue: Sequelize.Sequelize.literal("CURRENT_TIMESTAMP"),
                onUpdate: Sequelize.Sequelize.literal("CURRENT_TIMESTAMP"),
            },
        },
        {
            sequelize,
            tableName: "plan_voucher",
            timestamps: false,
            indexes: [
                {
                    name: "PRIMARY",
                    unique: true,
                    using: "BTREE",
                    fields: [{ name: "voucher_id" }],
                },
                {
                    name: "idx_vcr_user",
                    using: "BTREE",
                    fields: [{ name: "voucher_user_id" }],
                },
                {
                    name: "idx_vcr_inv",
                    using: "BTREE",
                    fields: [{ name: "voucher_inv_id" }],
                },
                {
                    name: "idx_vcr_spbu",
                    using: "BTREE",
                    fields: [{ name: "voucher_spbu_id" }],
                },
                {
                    name: "idx_vcr_status",
                    using: "BTREE",
                    fields: [{ name: "voucher_status" }],
                },
            ],
        },
    );
};
