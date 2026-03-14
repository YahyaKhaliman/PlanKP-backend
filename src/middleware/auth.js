const jwt = require("jsonwebtoken");
const { plan_user } = require("../models");
const response = require("../utils/response");

const verifyToken = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return response.error(res, "Token tidak ditemukan", 401);
        }
        const token = authHeader.split(" ")[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await plan_user.scope("withPassword").findOne({
            where: { user_id: decoded.id, user_is_active: 1 },
            attributes: { exclude: ["user_password"] },
        });
        if (!user)
            return response.error(
                res,
                "User tidak ditemukan atau tidak aktif",
                401,
            );
        req.user = user;
        next();
    } catch (err) {
        if (err.name === "TokenExpiredError")
            return response.error(res, "Token sudah kadaluarsa", 401);
        return response.error(res, "Token tidak valid", 401);
    }
};

const allowOnly =
    (...jabatan) =>
    (req, res, next) => {
        if (!jabatan.includes(req.user.user_jabatan)) {
            return response.error(res, "Akses ditolak", 403);
        }
        next();
    };

module.exports = { verifyToken, allowOnly };
