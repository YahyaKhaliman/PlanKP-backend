const express = require("express");
const router = express.Router();
const { login, me, changePassword } = require("../controllers/auth.controller");
const { verifyToken } = require("../middleware/auth");

router.post("/login", login);
router.get("/me", verifyToken, me);
router.put("/change-password", verifyToken, changePassword);

module.exports = router;
