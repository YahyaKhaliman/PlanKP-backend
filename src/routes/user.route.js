const router = require("express").Router();
const { verifyToken, allowOnly } = require("../middleware/auth");
const user = require("../controllers/user.controller");

router.get("/users", verifyToken, allowOnly("admin", "user"), user.getAll);
router.post("/users", verifyToken, allowOnly("admin"), user.create);
router.put("/users/:id", verifyToken, allowOnly("admin"), user.update);
router.patch(
    "/users/:id/aktif",
    verifyToken,
    allowOnly("admin"),
    user.toggleAktif,
);

module.exports = router;
