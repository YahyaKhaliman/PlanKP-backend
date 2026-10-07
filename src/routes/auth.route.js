const express = require("express");
const router = express.Router();
const {
    login,
    me,
    changePassword,
    register,
} = require("../controllers/auth.controller");
const { verifyToken } = require("../middleware/auth");

router.post("/login", login);
router.post("/register", register);
router.get("/me", verifyToken, me);
router.put("/change-password", verifyToken, changePassword);

module.exports = router;
