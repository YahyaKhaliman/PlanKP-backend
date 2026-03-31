const jwt = require("jsonwebtoken");
const response = require("../utils/response");
const UserService = require("../services/user.service");

const verifyToken = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return response.error(res, "Token tidak ditemukan", 401);
        }
        const token = authHeader.split(" ")[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await UserService.findActiveById(decoded.id);
        if (!user)
            return response.error(
                res,
                "User tidak ditemukan atau tidak aktif",
                401,
            );
        req.user = user;
        if (user.user_jabatan === "admin") {
            req.adminScope = user.user_divisi;
        }
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
