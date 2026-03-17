const router = require("express").Router();
const jenis = require("../controllers/jenis.controller");
const { allowOnly } = require("../middleware/auth");

router.get("/jenis", allowOnly("admin"), jenis.getAll);
router.post("/jenis", allowOnly("admin"), jenis.create);
router.put("/jenis/:id", allowOnly("admin"), jenis.update);
router.delete("/jenis/:id", allowOnly("admin"), jenis.remove);

module.exports = router;
