const Sequelize = require("sequelize");
module.exports = function (sequelize, DataTypes) {
    return sequelize.define(
        "plan_jadwal",
        {
            jdw_id: {
                autoIncrement: true,
                type: DataTypes.INTEGER,
                allowNull: false,
                primaryKey: true,
            },
            jdw_judul: {
                type: DataTypes.STRING(150),
                allowNull: false,
            },
            jdw_inv_jenis: {
                type: DataTypes.STRING(100),
                allowNull: false,
            },
            jdw_divisi: {
                type: DataTypes.ENUM(
                    "Teknisi Jahit",
                    "Teknisi Umum",
                    "IT Support",
                    "Satpam",
                    "Kebersihan",
                ),
                allowNull: false,
            },
            jdw_frekuensi: {
                type: DataTypes.ENUM("Harian", "Mingguan", "Bulanan"),
                allowNull: false,
            },
            jdw_tgl_mulai: {
                type: DataTypes.DATEONLY,
                allowNull: false,
            },
            jdw_tgl_selesai: {
                type: DataTypes.DATEONLY,
                allowNull: true,
            },
            jdw_week_number: {
                type: DataTypes.TINYINT,
                allowNull: true,
            },
            jdw_bulan: {
                type: DataTypes.TINYINT,
                allowNull: true,
            },
            jdw_tahun: {
                type: DataTypes.SMALLINT.UNSIGNED,
                allowNull: false,
            },
            jdw_assigned_to: {
                type: DataTypes.INTEGER,
                allowNull: true,
                references: {
                    model: "plan_user",
                    key: "user_id",
                },
            },
            jdw_status: {
                type: DataTypes.ENUM("Draft", "Aktif", "Selesai", "Dibatalkan"),
                allowNull: false,
                defaultValue: "Draft",
            },
            jdw_notes: {
                type: DataTypes.TEXT,
                allowNull: true,
            },
            jdw_dibuat_oleh: {
                type: DataTypes.INTEGER,
                allowNull: false,
                references: {
                    model: "plan_user",
                    key: "user_id",
                },
            },
            jdw_created_at: {
                type: DataTypes.DATE,
                allowNull: false,
                defaultValue: Sequelize.Sequelize.literal("CURRENT_TIMESTAMP"),
            },
            jdw_updated_at: {
                type: DataTypes.DATE,
                allowNull: false,
                defaultValue: Sequelize.Sequelize.literal("CURRENT_TIMESTAMP"),
            },
        },
        {
            sequelize,
            tableName: "plan_jadwal",
            timestamps: false,
            indexes: [
                {
                    name: "PRIMARY",
                    unique: true,
                    using: "BTREE",
                    fields: [{ name: "jdw_id" }],
                },
                {
                    name: "idx_jdw_jenis",
                    using: "BTREE",
                    fields: [{ name: "jdw_inv_jenis" }],
                },
                {
                    name: "idx_jdw_divisi",
                    using: "BTREE",
                    fields: [{ name: "jdw_divisi" }],
                },
                {
                    name: "idx_jdw_status",
                    using: "BTREE",
                    fields: [{ name: "jdw_status" }],
                },
                {
                    name: "idx_jdw_assigned",
                    using: "BTREE",
                    fields: [{ name: "jdw_assigned_to" }],
                },
                {
                    name: "idx_jdw_periode",
                    using: "BTREE",
                    fields: [
                        { name: "jdw_tahun" },
                        { name: "jdw_bulan" },
                        { name: "jdw_week_number" },
                    ],
                },
                {
                    name: "idx_jdw_tgl",
                    using: "BTREE",
                    fields: [
                        { name: "jdw_tgl_mulai" },
                        { name: "jdw_tgl_selesai" },
                    ],
                },
                {
                    name: "fk_jdw_dibuat",
                    using: "BTREE",
                    fields: [{ name: "jdw_dibuat_oleh" }],
                },
            ],
        },
    );
};
