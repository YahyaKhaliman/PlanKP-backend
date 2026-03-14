require("dotenv").config();
const express = require("express");
const cors = require("cors");

const { sequelize } = require("./models");
const { errorHandler, notFound } = require("./middleware/errorHandler");
const logger = require("./middleware/logger");

const authRoutes = require("./routes/auth.route");

const app = express();

app.use(
    cors({ origin: "*", methods: ["GET", "POST", "PUT", "PATCH", "DELETE"] }),
);
app.use(logger);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

app.get("/api/health", (req, res) =>
    res.json({ success: true, message: "PlanKP API running" }),
);

app.use("/api/auth", authRoutes);

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 3000;

sequelize
    .authenticate()
    .then(() => {
        console.log("Database terhubung.");
        app.listen(PORT, () =>
            console.log(`PlanKP API berjalan di http://localhost:${PORT}`),
        );
    })
    .catch((err) => {
        console.error("Gagal koneksi database:", err.message);
        process.exit(1);
    });

module.exports = app;
