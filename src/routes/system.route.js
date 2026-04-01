const router = require("express").Router();
const { verifyToken } = require("../middleware/auth");
const system = require("../controllers/system.controller");

// Route publik (tidak perlu token)
router.get("/pabrik", system.getPabrik);

// Route yang perlu token
router.use(verifyToken);
router.get("/metadata", system.getMetadata);
router.get("/dashboard/summary", system.getDashboardSummary);

module.exports = router;
