const router = require("express").Router();
const { verifyToken } = require("../middleware/auth");
const realisasi = require("../controllers/realisasi.controller");

router.use(verifyToken);

router.get("/realisasi/template/:inv_jenis", realisasi.getTemplate);
router.get("/realisasi", realisasi.getAll);
router.get("/realisasi/:id", realisasi.getOne);
router.post("/realisasi", realisasi.create);
router.put("/realisasi/:id", realisasi.update);
router.post("/realisasi/:id/checklist", realisasi.saveChecklist);
router.post("/realisasi/:id/ttd", realisasi.saveTtd);

module.exports = router;
