const Sequelize = require('sequelize');
module.exports = function(sequelize, DataTypes) {
  return sequelize.define('plan_realisasi', {
    real_id: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    real_jadwal_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'plan_jadwal',
        key: 'jdw_id'
      }
    },
    real_inv_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'plan_inventaris',
        key: 'inv_id'
      }
    },
    real_teknisi_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'plan_user',
        key: 'user_id'
      }
    },
    real_tgl: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    real_jam_mulai: {
      type: DataTypes.TIME,
      allowNull: true
    },
    real_jam_selesai: {
      type: DataTypes.TIME,
      allowNull: true
    },
    real_week_number: {
      type: DataTypes.TINYINT,
      allowNull: false
    },
    real_bulan: {
      type: DataTypes.TINYINT,
      allowNull: false
    },
    real_tahun: {
      type: DataTypes.DATE,
      allowNull: false
    },
    real_kondisi_akhir: {
      type: DataTypes.ENUM('Baik','Perlu Perhatian','Rusak'),
      allowNull: true
    },
    real_keterangan: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    real_status: {
      type: DataTypes.ENUM('Draft','Menunggu Approval','Selesai','Ditolak'),
      allowNull: false,
      defaultValue: "Draft"
    },
    real_ttd_data: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    real_ttd_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    real_approved_by: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'plan_user',
        key: 'user_id'
      }
    },
    real_approved_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    real_catatan_approver: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    real_created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: Sequelize.Sequelize.literal('CURRENT_TIMESTAMP')
    },
    real_updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: Sequelize.Sequelize.literal('CURRENT_TIMESTAMP')
    }
  }, {
    sequelize,
    tableName: 'plan_realisasi',
    timestamps: false,
    indexes: [
      {
        name: "PRIMARY",
        unique: true,
        using: "BTREE",
        fields: [
          { name: "real_id" },
        ]
      },
      {
        name: "idx_real_jadwal",
        using: "BTREE",
        fields: [
          { name: "real_jadwal_id" },
        ]
      },
      {
        name: "idx_real_inv",
        using: "BTREE",
        fields: [
          { name: "real_inv_id" },
        ]
      },
      {
        name: "idx_real_teknisi",
        using: "BTREE",
        fields: [
          { name: "real_teknisi_id" },
        ]
      },
      {
        name: "idx_real_tgl",
        using: "BTREE",
        fields: [
          { name: "real_tgl" },
        ]
      },
      {
        name: "idx_real_status",
        using: "BTREE",
        fields: [
          { name: "real_status" },
        ]
      },
      {
        name: "idx_real_periode",
        using: "BTREE",
        fields: [
          { name: "real_tahun" },
          { name: "real_bulan" },
          { name: "real_week_number" },
        ]
      },
      {
        name: "fk_real_approved",
        using: "BTREE",
        fields: [
          { name: "real_approved_by" },
        ]
      },
    ]
  });
};
