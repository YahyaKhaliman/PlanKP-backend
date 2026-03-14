const Sequelize = require('sequelize');
module.exports = function(sequelize, DataTypes) {
  return sequelize.define('plan_user', {
    user_id: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    user_nama: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    user_nik: {
      type: DataTypes.STRING(20),
      allowNull: false,
      unique: "uq_user_nik"
    },
    user_password: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    user_jabatan: {
      type: DataTypes.STRING(50),
      allowNull: false
    },
    user_cabang: {
      type: DataTypes.STRING(3),
      allowNull: true
    },
    user_is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: 1
    },
    user_created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: Sequelize.Sequelize.literal('CURRENT_TIMESTAMP')
    },
    user_updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: Sequelize.Sequelize.literal('CURRENT_TIMESTAMP')
    }
  }, {
    sequelize,
    tableName: 'plan_user',
    timestamps: false,
    indexes: [
      {
        name: "PRIMARY",
        unique: true,
        using: "BTREE",
        fields: [
          { name: "user_id" },
        ]
      },
      {
        name: "uq_user_nik",
        unique: true,
        using: "BTREE",
        fields: [
          { name: "user_nik" },
        ]
      },
      {
        name: "idx_user_jabatan",
        using: "BTREE",
        fields: [
          { name: "user_jabatan" },
        ]
      },
    ]
  });
};
