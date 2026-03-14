const Sequelize = require('sequelize');
module.exports = function(sequelize, DataTypes) {
  return sequelize.define('plan_hasil_checklist', {
    hc_id: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    hc_real_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'plan_realisasi',
        key: 'real_id'
      }
    },
    hc_ct_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'plan_checklist_template',
        key: 'ct_id'
      }
    },
    hc_hasil: {
      type: DataTypes.ENUM('OK','NK','N/A'),
      allowNull: false
    },
    hc_kondisi: {
      type: DataTypes.ENUM('Baik','Sedang','Buruk'),
      allowNull: true
    },
    hc_keterangan: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    hc_created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: Sequelize.Sequelize.literal('CURRENT_TIMESTAMP')
    }
  }, {
    sequelize,
    tableName: 'plan_hasil_checklist',
    timestamps: false,
    indexes: [
      {
        name: "PRIMARY",
        unique: true,
        using: "BTREE",
        fields: [
          { name: "hc_id" },
        ]
      },
      {
        name: "idx_hc_real",
        using: "BTREE",
        fields: [
          { name: "hc_real_id" },
        ]
      },
      {
        name: "idx_hc_ct",
        using: "BTREE",
        fields: [
          { name: "hc_ct_id" },
        ]
      },
      {
        name: "idx_hc_hasil",
        using: "BTREE",
        fields: [
          { name: "hc_hasil" },
        ]
      },
    ]
  });
};
