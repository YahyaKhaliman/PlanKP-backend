const router = require("express").Router();
const { verifyToken, allowOnly } = require("../middleware/auth");
const voucher = require("../controllers/voucher.controller");

router.use(verifyToken);

// Metadata bantuan
router.get("/voucher/bbm-types", voucher.getBbmTypes);
router.get("/voucher/spbu", voucher.getSpbuList);
router.get("/voucher/eligible-inventaris", voucher.getEligibleInventaris);

// Transaksi Voucher
router.get("/voucher", voucher.getVouchers);
router.get("/voucher/:id", voucher.getVoucherDetail);
router.post("/voucher", voucher.createVoucher);

// Approval Admin / Manager
router.put(
    "/voucher/:id/approve",
    allowOnly("admin", "manager"),
    voucher.approveVoucher,
);
router.put(
    "/voucher/:id/reject",
    allowOnly("admin", "manager"),
    voucher.rejectVoucher,
);

module.exports = router;
