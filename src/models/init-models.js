var DataTypes = require("sequelize").DataTypes;
var _plan_checklist_template = require("./plan_checklist_template");
var _plan_hasil_checklist = require("./plan_hasil_checklist");
var _plan_inventaris = require("./plan_inventaris");
var _plan_jadwal = require("./plan_jadwal");
var _plan_realisasi = require("./plan_realisasi");
var _plan_user = require("./plan_user");
var _plan_jenis = require("./plan_jenis");

function initModels(sequelize) {
    var plan_checklist_template = _plan_checklist_template(
        sequelize,
        DataTypes,
    );
    var plan_hasil_checklist = _plan_hasil_checklist(sequelize, DataTypes);
    var plan_inventaris = _plan_inventaris(sequelize, DataTypes);
    var plan_jadwal = _plan_jadwal(sequelize, DataTypes);
    var plan_realisasi = _plan_realisasi(sequelize, DataTypes);
    var plan_user = _plan_user(sequelize, DataTypes);
    var plan_jenis = _plan_jenis(sequelize, DataTypes);

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
    plan_inventaris.belongsTo(plan_user, {
        as: "pic_user",
        foreignKey: "inv_pic",
    });
    plan_user.hasMany(plan_inventaris, {
        as: "pic_user_plan_inventariss",
        foreignKey: "inv_pic",
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
        as: "real_approved_by_plan_user",
        foreignKey: "real_approved_by",
    });
    plan_user.hasMany(plan_realisasi, {
        as: "plan_realisasis",
        foreignKey: "real_approved_by",
    });
    plan_realisasi.belongsTo(plan_user, {
        as: "real_teknisi",
        foreignKey: "real_teknisi_id",
    });
    plan_user.hasMany(plan_realisasi, {
        as: "real_teknisi_plan_realisasis",
        foreignKey: "real_teknisi_id",
    });

    return {
        plan_checklist_template,
        plan_hasil_checklist,
        plan_inventaris,
        plan_jadwal,
        plan_realisasi,
        plan_user,
        plan_jenis,
    };
}
module.exports = initModels;
module.exports.initModels = initModels;
module.exports.default = initModels;
