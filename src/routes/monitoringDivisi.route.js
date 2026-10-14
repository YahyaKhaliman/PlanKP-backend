const router = require("express").Router();
const { verifyToken, allowOnly } = require("../middleware/auth");
const monitoringDivisi = require("../controllers/monitoringDivisi.controller");

// Route yang perlu token
router.use(verifyToken);
router.get("/monitoring-divisi", allowOnly("manager"), monitoringDivisi.getMonitoringDivisi);

module.exports = router;
