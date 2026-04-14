module.exports = function (sequelize, DataTypes) {
    return sequelize.define(
        "tpabrik",
        {
            pab_kode: {
                type: DataTypes.STRING(10),
                allowNull: false,
                primaryKey: true,
            },
            pab_nama: {
                type: DataTypes.STRING(100),
                allowNull: true,
            },
            pab_path: {
                type: DataTypes.STRING(200),
                allowNull: true,
            },
            pab_alamat: {
                type: DataTypes.STRING(255),
                allowNull: true,
            },
            pab_pabrik: {
                type: DataTypes.STRING(10),
                allowNull: true,
            },
            pab_mintaobat: {
                type: DataTypes.CHAR(1),
                allowNull: false,
                defaultValue: "N",
            },
        },
        {
            sequelize,
            tableName: "kencanaprint.tpabrik",
            timestamps: false,
            indexes: [
                {
                    name: "PRIMARY",
                    unique: true,
                    using: "BTREE",
                    fields: [{ name: "pab_kode" }],
                },
                {
                    name: "pab_mintaobat",
                    using: "BTREE",
                    fields: [{ name: "pab_mintaobat" }],
                },
            ],
        },
    );
};
