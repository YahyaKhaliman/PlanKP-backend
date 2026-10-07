const { DataTypes } = require("sequelize");

function initModels(sequelize) {
    const plan_checklist_template = require("./plan_checklist_template")(sequelize, DataTypes);
    const plan_hasil_checklist = require("./plan_hasil_checklist")(sequelize, DataTypes);
    const plan_inventaris = require("./plan_inventaris")(sequelize, DataTypes);
    const plan_jadwal = require("./plan_jadwal")(sequelize, DataTypes);
    const plan_realisasi = require("./plan_realisasi")(sequelize, DataTypes);
    const plan_user = require("./plan_user")(sequelize, DataTypes);
    const plan_jenis = require("./plan_jenis")(sequelize, DataTypes);
    const log_plankp = require("./log_plankp")(sequelize, DataTypes);
    const plan_spbu = require("./plan_spbu")(sequelize, DataTypes);
    const plan_voucher = require("./plan_voucher")(sequelize, DataTypes);

    plan_hasil_checklist.belongsTo(plan_checklist_template, {
        as: "hc_ct",
        foreignKey: "hc_ct_id",
    });
    plan_checklist_template.hasMany(plan_hasil_checklist, {
        as: "plan_hasil_checklists",
        foreignKey: "hc_ct_id",
    });

    plan_realisasi.belongsTo(plan_inventaris, {
        as: "real_inv",
        foreignKey: "real_inv_id",
    });
    plan_inventaris.hasMany(plan_realisasi, {
        as: "plan_realisasis",
        foreignKey: "real_inv_id",
    });

    plan_realisasi.belongsTo(plan_jadwal, {
        as: "real_jadwal",
        foreignKey: "real_jadwal_id",
    });
    plan_jadwal.hasMany(plan_realisasi, {
        as: "plan_realisasis",
        foreignKey: "real_jadwal_id",
    });

    plan_hasil_checklist.belongsTo(plan_realisasi, {
        as: "hc_real",
        foreignKey: "hc_real_id",
    });
    plan_realisasi.hasMany(plan_hasil_checklist, {
        as: "plan_hasil_checklists",
        foreignKey: "hc_real_id",
    });

    plan_jadwal.belongsTo(plan_user, {
        as: "jdw_assigned_to_plan_user",
        foreignKey: "jdw_assigned_to",
    });
    plan_user.hasMany(plan_jadwal, {
        as: "plan_jadwals",
        foreignKey: "jdw_assigned_to",
    });

    plan_jadwal.belongsTo(plan_user, {
        as: "jdw_dibuat_oleh_plan_user",
        foreignKey: "jdw_dibuat_oleh",
    });
    plan_user.hasMany(plan_jadwal, {
        as: "jdw_dibuat_oleh_plan_jadwals",
        foreignKey: "jdw_dibuat_oleh",
    });

    plan_inventaris.belongsTo(plan_jenis, {
        as: "jenis",
        foreignKey: "inv_jenis_id",
    });
    plan_jenis.hasMany(plan_inventaris, {
        as: "plan_inventariss",
        foreignKey: "inv_jenis_id",
    });

    plan_jadwal.belongsTo(plan_jenis, {
        as: "jdw_jenis",
        foreignKey: "jdw_jenis_id",
    });
    plan_jenis.hasMany(plan_jadwal, {
        as: "plan_jadwals",
        foreignKey: "jdw_jenis_id",
    });

    plan_checklist_template.belongsTo(plan_jenis, {
        as: "ct_jenis",
        foreignKey: "ct_jenis_id",
    });
    plan_jenis.hasMany(plan_checklist_template, {
        as: "plan_checklist_templates",
        foreignKey: "ct_jenis_id",
    });

    plan_realisasi.belongsTo(plan_user, {
        as: "real_teknisi",
        foreignKey: "real_teknisi_id",
    });
    plan_user.hasMany(plan_realisasi, {
        as: "real_teknisi_plan_realisasis",
        foreignKey: "real_teknisi_id",
    });

    plan_realisasi.belongsTo(plan_user, {
        as: "real_approved_by_user",
        foreignKey: "real_approved_by",
    });
    plan_user.hasMany(plan_realisasi, {
        as: "real_approved_plan_realisasis",
        foreignKey: "real_approved_by",
    });

    // Relasi Voucher BBM Kencana Print
    plan_voucher.belongsTo(plan_user, {
        as: "pemohon",
        foreignKey: "voucher_user_id",
    });
    plan_user.hasMany(plan_voucher, {
        as: "vouchers",
        foreignKey: "voucher_user_id",
    });

    plan_voucher.belongsTo(plan_user, {
        as: "approver",
        foreignKey: "voucher_approved_by",
    });
    plan_user.hasMany(plan_voucher, {
        as: "approved_vouchers",
        foreignKey: "voucher_approved_by",
    });

    plan_voucher.belongsTo(plan_inventaris, {
        as: "inventaris",
        foreignKey: "voucher_inv_id",
    });
    plan_inventaris.hasMany(plan_voucher, {
        as: "vouchers",
        foreignKey: "voucher_inv_id",
    });

    plan_voucher.belongsTo(plan_spbu, {
        as: "spbu",
        foreignKey: "voucher_spbu_id",
    });
    plan_spbu.hasMany(plan_voucher, {
        as: "vouchers",
        foreignKey: "voucher_spbu_id",
    });

    return {
        plan_checklist_template,
        plan_hasil_checklist,
        plan_inventaris,
        plan_jadwal,
        plan_realisasi,
        plan_user,
        plan_jenis,
        log_plankp,
        plan_spbu,
        plan_voucher,
    };
}

module.exports = initModels;
