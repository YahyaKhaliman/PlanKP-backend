const router = require("express").Router();
const { verifyToken, allowOnly } = require("../middleware/auth");
const ct = require("../controllers/checklistTemplate.controller");

router.use(verifyToken);
// ── Checklist Template ─────────────────────────────────────────
router.get("/checklist-template", ct.getAll);
router.post("/checklist-template", allowOnly("admin"), ct.create);
router.put("/checklist-template/:id", allowOnly("admin"), ct.update);
router.delete("/checklist-template/:id", allowOnly("admin"), ct.remove);
router.get("/checklist-template/jenis", allowOnly("admin"), ct.getJenis);

module.exports = router;
