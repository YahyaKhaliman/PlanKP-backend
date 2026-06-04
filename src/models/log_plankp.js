module.exports = function (sequelize, DataTypes) {
    return sequelize.define(
        "log_plankp",
        {
            log_id: {
                autoIncrement: true,
                type: DataTypes.INTEGER,
                allowNull: false,
                primaryKey: true,
            },
            user_nama: {
                type: DataTypes.STRING(255),
                allowNull: true,
            },
            log_status: {
                type: DataTypes.STRING(50),
                allowNull: true,
            },
            log_keterangan: {
                type: DataTypes.STRING(255),
                allowNull: true,
            },
            log_versi: {
                type: DataTypes.STRING(50),
                allowNull: true,
            },
            tanggal: {
                type: DataTypes.DATE,
                allowNull: true,
                defaultValue: sequelize.literal('CURRENT_TIMESTAMP')
            },
        },
        {
            sequelize,
            tableName: "log_plankp",
            timestamps: false,
            indexes: [
                {
                    name: "PRIMARY",
                    unique: true,
                    using: "BTREE",
                    fields: [{ name: "log_id" }],
                },
            ],
        }
    );
};
