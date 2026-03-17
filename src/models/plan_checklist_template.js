const Sequelize = require("sequelize");
module.exports = function (sequelize, DataTypes) {
    return sequelize.define(
        "plan_checklist_template",
        {
            ct_id: {
                autoIncrement: true,
                type: DataTypes.INTEGER,
                allowNull: false,
                primaryKey: true,
            },
            ct_inv_jenis: {
                type: DataTypes.STRING(100),
                allowNull: false,
            },
            ct_item: {
                type: DataTypes.STRING(200),
                allowNull: false,
            },
            ct_keterangan: {
                type: DataTypes.STRING(255),
                allowNull: true,
            },
            ct_urutan: {
                type: DataTypes.TINYINT,
                allowNull: false,
                defaultValue: 1,
            },
            ct_is_active: {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: 1,
            },
            ct_created_by: {
                type: DataTypes.INTEGER,
                allowNull: false,
                references: {
                    model: "plan_user",
                    key: "user_id",
                },
            },
            ct_created_at: {
                type: DataTypes.DATE,
                allowNull: false,
                defaultValue: Sequelize.Sequelize.literal("CURRENT_TIMESTAMP"),
            },
        },
        {
            sequelize,
            tableName: "plan_checklist_template",
            timestamps: false,
            indexes: [
                {
                    name: "PRIMARY",
                    unique: true,
                    using: "BTREE",
                    fields: [{ name: "ct_id" }],
                },
                {
                    name: "idx_ct_jenis",
                    using: "BTREE",
                    fields: [{ name: "ct_inv_jenis" }],
                },
                {
                    name: "idx_ct_urutan",
                    using: "BTREE",
                    fields: [{ name: "ct_inv_jenis" }, { name: "ct_urutan" }],
                },
            ],
        },
    );
};
