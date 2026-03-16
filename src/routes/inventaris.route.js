const router = require("express").Router();
const { verifyToken, allowOnly } = require("../middleware/auth");
const inv = require("../controllers/inventaris.controller");

router.use(verifyToken);

// ── Inventaris ─────────────────────────────────────────────────
router.get("/inv", inv.getAll);
router.get("/inv/jenis", inv.getJenis);
router.get("/inv/:id", inv.getOne);
router.post("/inv", allowOnly("admin"), inv.create);
router.put("/inv/:id", allowOnly("admin"), inv.update);
router.patch("/inv/:id/aktif", allowOnly("admin"), inv.toggleAktif);

module.exports = router;
