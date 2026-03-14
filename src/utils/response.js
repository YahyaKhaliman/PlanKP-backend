const ok = (res, data = null, message = "Berhasil", statusCode = 200) => {
    return res.status(statusCode).json({ success: true, message, data });
};

const created = (res, data = null, message = "Data berhasil dibuat") => {
    return res.status(201).json({ success: true, message, data });
};

const error = (
    res,
    message = "Terjadi kesalahan",
    statusCode = 500,
    errors = null,
) => {
    const body = { success: false, message };
    if (errors) body.errors = errors;
    return res.status(statusCode).json(body);
};

module.exports = { ok, created, error };
