const express = require("express");
const router = express.Router();
const {
    login,
    me,
    changePassword,
    register,
} = require("../controllers/auth.controller");
const { verifyToken } = require("../middleware/auth");
const validate = require("../middleware/validate");
const {
    loginSchema,
    registerSchema,
    changePasswordSchema,
} = require("../validators/auth.validator");

router.post("/login", validate(loginSchema), login);
router.post("/register", validate(registerSchema), register);
router.get("/me", verifyToken, me);
router.put(
    "/change-password",
    verifyToken,
    validate(changePasswordSchema),
    changePassword,
);

module.exports = router;
