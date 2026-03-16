const router = require("express").Router();
const { verifyToken, allowOnly } = require("../middleware/auth");
const jadwal = require("../controllers/jadwal.controller");

router.use(verifyToken);

// ── Jadwal ─────────────────────────────────────────────────────
router.get("/jadwal/hari-ini", jadwal.hariIni);
router.get("/jadwal", jadwal.getAll);
router.get("/jadwal/:id", jadwal.getOne);
router.post("/jadwal", allowOnly("admin"), jadwal.create);
router.put("/jadwal/:id", allowOnly("admin"), jadwal.update);
router.patch("/jadwal/:id/status", allowOnly("admin"), jadwal.updateStatus);

module.exports = router;
