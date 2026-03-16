const router = require("express").Router();
const { verifyToken, allowOnly } = require("../middleware/auth");
const user = require("../controllers/user.controller");

router.use(verifyToken, allowOnly("admin"));

router.get("/users", user.getAll);
router.post("/users", user.create);
router.put("/users/:id", user.update);
router.patch("/users/:id/aktif", user.toggleAktif);

module.exports = router;
