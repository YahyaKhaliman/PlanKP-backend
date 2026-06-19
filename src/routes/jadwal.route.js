const router = require("express").Router();
const { verifyToken, allowOnly } = require("../middleware/auth");
const jadwal = require("../controllers/jadwal.controller");

router.use(verifyToken);

// ── Jadwal ─────────────────────────────────────────────────────
router.get("/jadwal/hari-ini", jadwal.hariIni);
router.get("/jadwal/hari-libur", jadwal.getHariLibur);
router.get("/jadwal", jadwal.getAll);
router.get("/jadwal/divisi", jadwal.getByDivisi);
router.get("/jadwal/assigned", jadwal.getByUser);
router.get("/jadwal/:id", jadwal.getOne);
router.post("/jadwal", allowOnly("admin", "manager"), jadwal.create);
router.put("/jadwal/:id", allowOnly("admin", "manager"), jadwal.update);
router.patch("/jadwal/:id/status", allowOnly("admin", "manager"), jadwal.updateStatus);

module.exports = router;
