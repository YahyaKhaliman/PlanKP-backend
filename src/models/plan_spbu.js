const Sequelize = require("sequelize");

module.exports = function (sequelize, DataTypes) {
    return sequelize.define(
        "plan_spbu",
        {
            spbu_id: {
                autoIncrement: true,
                type: DataTypes.INTEGER,
                allowNull: false,
                primaryKey: true,
            },
            spbu_nama: {
                type: DataTypes.STRING(150),
                allowNull: false,
            },
            spbu_alamat: {
                type: DataTypes.TEXT,
                allowNull: true,
            },
            spbu_is_active: {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: 1,
            },
            spbu_created_at: {
                type: DataTypes.DATE,
                allowNull: false,
                defaultValue: Sequelize.Sequelize.literal("CURRENT_TIMESTAMP"),
            },
            spbu_updated_at: {
                type: DataTypes.DATE,
                allowNull: false,
                defaultValue: Sequelize.Sequelize.literal("CURRENT_TIMESTAMP"),
                onUpdate: Sequelize.Sequelize.literal("CURRENT_TIMESTAMP"),
            },
        },
        {
            sequelize,
            tableName: "plan_spbu",
            timestamps: false,
            indexes: [
                {
                    name: "PRIMARY",
                    unique: true,
                    using: "BTREE",
                    fields: [{ name: "spbu_id" }],
                },
                {
                    name: "idx_spbu_active",
                    using: "BTREE",
                    fields: [{ name: "spbu_is_active" }],
                },
            ],
        },
    );
};
