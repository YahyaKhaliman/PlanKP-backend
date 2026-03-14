const router = require("express").Router();
const { verifyToken, allowOnly } = require("../middleware/auth");
const inv = require("../controllers/inventaris.controller");

router.use(verifyToken);

// ── Inventaris ─────────────────────────────────────────────────
router.get("/inventaris", inv.getAll);
router.get("/inventaris/:id", inv.getOne);
router.post("/inventaris", allowOnly("admin"), inv.create);
router.put("/inventaris/:id", allowOnly("admin"), inv.update);
router.patch("/inventaris/:id/aktif", allowOnly("admin"), inv.toggleAktif);

module.exports = router;
