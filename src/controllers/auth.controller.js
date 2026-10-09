const jwt = require("jsonwebtoken");
const { plan_user, log_plankp } = require("../models");
const response = require("../utils/response");
const { normalizeDivisi } = require("../utils/divisi");

const generateToken = (user) => {
    return jwt.sign(
        {
            id: user.user_id,
            jabatan: user.user_jabatan,
            divisi: user.user_divisi,
        },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || "8h" },
    );
};

const writeLog = (user_nama, status, keterangan, versi) => {
    if (!user_nama) return Promise.resolve();
    return log_plankp
        .create({
            user_nama,
            log_status: status,
            log_keterangan: keterangan,
            log_versi: versi || null,
        })
        .catch(() => {});
};

const register = async (req, res, next) => {
    try {
        const {
            user_nama,
            user_password,
            user_divisi,
            user_nik,
            user_cabang,
            user_jabatan,
        } = req.body ?? {};
        if (!user_nama || !user_password || !user_divisi || !user_nik || !user_cabang) {
            return response.error(
                res,
                "Nama, password, divisi, NIK, dan cabang wajib diisi",
                400,
            );
        }
        if (user_password.length < 3) {
            return response.error(res, "Password minimal 3 karakter", 400);
        }

        const normalizedDivisi = normalizeDivisi(user_divisi);
        if (!normalizedDivisi) {
            return response.error(res, "Divisi tidak valid", 400);
        }

        const existed = await plan_user.findOne({ where: { user_nama, user_is_active: 1 } });
        if (existed) {
            return response.error(res, "Username sudah digunakan", 400);
        }

        const hashedPassword = await plan_user.hashPassword(user_password);
        const created = await plan_user.create({
            user_nama,
            user_nik: (user_nik || user_nama).trim(),
            user_password: hashedPassword,
            user_divisi: normalizedDivisi,
            user_jabatan: user_jabatan || "user",
            user_cabang,
            user_is_active: 1,
        });

        const plain = created.toJSON();
        delete plain.user_password;
        const token = generateToken(plain);

        return response.ok(res, { token, user: plain }, "Registrasi berhasil");
    } catch (err) {
        next(err);
    }
};

const resolveClientPlatform = (req, bodyPlatform) => {
    if (bodyPlatform && typeof bodyPlatform === "string" && bodyPlatform.trim()) {
        return bodyPlatform.trim();
    }
    const ua = (req.get("user-agent") || "").toLowerCase();
    if (ua.includes("android")) return "Android";
    if (ua.includes("iphone") || ua.includes("ipad") || ua.includes("ios")) return "iOS";
    if (ua.includes("dart") || ua.includes("okhttp") || ua.includes("cfnetwork")) return "Mobile";
    if (ua.includes("mozilla") || ua.includes("chrome") || ua.includes("safari") || ua.includes("edge")) return "Web";
    return "App";
};

const formatVersionString = (appVersion, platform) => {
    const rawVersion = String(appVersion || "1.0.0").trim();
    if (rawVersion.includes("(") && rawVersion.includes(")")) {
        return rawVersion.substring(0, 50);
    }
    const combined = platform ? `${rawVersion} (${platform})` : rawVersion;
    return combined.substring(0, 50);
};

const login = async (req, res, next) => {
    try {
        const { user_nama, user_password, app_version, platform } = req.body ?? {};
        const clientPlatform = resolveClientPlatform(req, platform);
        const logVersi = formatVersionString(app_version, clientPlatform);

        if (!user_nama || !user_password) {
            await writeLog(
                user_nama,
                "GAGAL",
                `Password tidak diisi (via ${clientPlatform})`,
                logVersi,
            );
            return response.error(
                res,
                "Nama pengguna dan password wajib diisi",
                400,
            );
        }

        const user = await plan_user.scope("withPassword").findOne({
            where: { user_nama, user_is_active: 1 },
        });

        if (!user || user.user_password !== user_password) {
            await writeLog(
                user_nama,
                "GAGAL",
                `Nama pengguna atau password salah (via ${clientPlatform})`,
                logVersi,
            );
            return response.error(res, "Nama pengguna atau password salah", 401);
        }

        const plain = user.toJSON();
        delete plain.user_password;
        const token = generateToken(plain);

        await writeLog(
            user_nama,
            "BERHASIL",
            `Login berhasil via ${clientPlatform}`,
            logVersi,
        );
        return response.ok(res, { token, user: plain }, "Login berhasil");
    } catch (err) {
        next(err);
    }
};

const me = async (req, res) => {
    const user = await plan_user.findOne({
        where: { user_id: req.user.user_id },
    });
    return response.ok(res, user);
};

const changePassword = async (req, res, next) => {
    try {
        const { password_lama, password_baru } = req.body ?? {};
        if (!password_lama || !password_baru) {
            return response.error(
                res,
                "Password lama dan baru wajib diisi",
                400,
            );
        }
        if (password_baru.length < 6) {
            return response.error(res, "Password baru minimal 6 karakter", 400);
        }

        const user = await plan_user
            .scope("withPassword")
            .findByPk(req.user.user_id);
        if (user.user_password !== password_lama)
            return response.error(res, "Password lama salah", 400);

        user.user_password = password_baru;
        await user.save();

        return response.ok(res, null, "Password berhasil diubah");
    } catch (err) {
        next(err);
    }
};

module.exports = { login, me, changePassword, register };
