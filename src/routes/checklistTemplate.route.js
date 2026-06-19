const router = require("express").Router();
const { verifyToken, allowOnly } = require("../middleware/auth");
const ct = require("../controllers/checklistTemplate.controller");

router.use(verifyToken);
// ── Checklist Template ─────────────────────────────────────────
router.get("/checklist-template", ct.getAll);
router.post("/checklist-template", allowOnly("admin", "manager"), ct.create);
router.post("/checklist-template/bulk", allowOnly("admin", "manager"), ct.bulkCreate);
router.put("/checklist-template/:id", allowOnly("admin", "manager"), ct.update);
router.delete("/checklist-template/:id", allowOnly("admin", "manager"), ct.remove);
router.get("/checklist-template/jenis", allowOnly("admin", "manager"), ct.getJenis);
router.get("/checklist-template/order/:jenis", allowOnly("admin", "manager"), ct.getAll);

module.exports = router;
