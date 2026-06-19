const router = require("express").Router();
const jenis = require("../controllers/jenis.controller");
const { verifyToken, allowOnly } = require("../middleware/auth");

router.use(verifyToken);

router.get("/jenis", jenis.getAll);
router.post("/jenis", allowOnly("admin", "manager"), jenis.create);
router.put("/jenis/:id", allowOnly("admin", "manager"), jenis.update);
router.delete("/jenis/:id", allowOnly("admin", "manager"), jenis.remove);

module.exports = router;
