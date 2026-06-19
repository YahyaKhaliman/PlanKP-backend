const router = require("express").Router();
const { verifyToken, allowOnly } = require("../middleware/auth");
const user = require("../controllers/user.controller");

router.get(
    "/users",
    verifyToken,
    allowOnly("admin", "user", "manager", "teknisi", "it_support"),
    user.getAll,
);
router.post("/users", verifyToken, allowOnly("admin", "manager"), user.create);
router.put("/users/:id", verifyToken, allowOnly("admin", "manager"), user.update);
router.patch(
    "/users/:id/aktif",
    verifyToken,
    allowOnly("admin", "manager"),
    user.toggleAktif,
);

module.exports = router;
