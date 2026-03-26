const DIVISI_CANONICAL = [
    "Teknisi Jahit",
    "Teknisi Umum",
    "IT Support",
    "Satpam",
    "Kebersihan",
];

const toKey = (value) =>
    String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");

const DIVISI_ALIAS_MAP = {
    teknisijahit: "Teknisi Jahit",
    teknisiumum: "Teknisi Umum",
    itsupport: "IT Support",
    satpam: "Satpam",
    kebersihan: "Kebersihan",
};

const normalizeDivisi = (value) => {
    if (value === undefined || value === null) return null;
    return DIVISI_ALIAS_MAP[toKey(value)] || null;
};

module.exports = {
    DIVISI_CANONICAL,
    normalizeDivisi,
};
