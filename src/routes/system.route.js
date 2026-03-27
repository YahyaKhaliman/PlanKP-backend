const router = require("express").Router();
const { verifyToken } = require("../middleware/auth");
const system = require("../controllers/system.controller");

router.use(verifyToken);

router.get("/metadata", system.getMetadata);
router.get("/dashboard/summary", system.getDashboardSummary);

module.exports = router;
