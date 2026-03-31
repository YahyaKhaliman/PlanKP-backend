const DIVISI_CANONICAL = ["GA", "IT", "Driver"];

const toKey = (value) =>
    String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");

const DIVISI_ALIAS_MAP = {
    ga: "GA",
    it: "IT",
    driver: "Driver",
};

const normalizeDivisi = (value) => {
    if (value === undefined || value === null) return null;
    return DIVISI_ALIAS_MAP[toKey(value)] || null;
};

module.exports = {
    DIVISI_CANONICAL,
    normalizeDivisi,
};
