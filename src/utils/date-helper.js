/**
 * Date Helper Utilities
 * Consistency untuk perhitungan week number, bulan, tahun di FE dan BE
 */

const getWeekNumber = (date) => {
    const d = new Date(
        Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
    );
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNumber = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
    return weekNumber;
};

const getMonthNumber = (date) => {
    return date.getMonth() + 1; // JavaScript bulan 0-11, convert jadi 1-12
};

const getYear = (date) => {
    return date.getFullYear();
};

const getDateComponents = (dateString) => {
    const date = new Date(dateString);
    return {
        weekNumber: getWeekNumber(date),
        month: getMonthNumber(date),
        year: getYear(date),
        dateObj: date,
    };
};

const calculateDaysDifference = (date1Str, date2Str) => {
    const d1 = new Date(date1Str);
    const d2 = new Date(date2Str);
    return Math.floor((d2 - d1) / (1000 * 60 * 60 * 24));
};

const normalizeDateOnly = (value) => {
    const date = value instanceof Date ? new Date(value) : new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
};

const formatDateOnly = (value) => {
    const date = normalizeDateOnly(value);
    if (!date) return null;
    const month = `${date.getMonth() + 1}`.padStart(2, "0");
    const day = `${date.getDate()}`.padStart(2, "0");
    return `${date.getFullYear()}-${month}-${day}`;
};

const addMonthsPreserveDay = (dateInput, monthsToAdd) => {
    const date = normalizeDateOnly(dateInput);
    if (!date) return null;

    const targetMonthIndex = date.getMonth() + monthsToAdd;
    const targetYear = date.getFullYear() + Math.floor(targetMonthIndex / 12);
    const normalizedMonth = ((targetMonthIndex % 12) + 12) % 12;
    const lastDayOfTargetMonth = new Date(
        targetYear,
        normalizedMonth + 1,
        0,
    ).getDate();
    const targetDay = Math.min(date.getDate(), lastDayOfTargetMonth);

    return new Date(targetYear, normalizedMonth, targetDay);
};

const addByFrequency = (dateInput, frekuensi, step = 1) => {
    const date = normalizeDateOnly(dateInput);
    if (!date) return null;

    switch (frekuensi) {
        case "Harian":
            return new Date(
                date.getFullYear(),
                date.getMonth(),
                date.getDate() + step,
            );
        case "Mingguan":
            return new Date(
                date.getFullYear(),
                date.getMonth(),
                date.getDate() + 7 * step,
            );
        case "Bulanan":
            return addMonthsPreserveDay(date, step);
        default:
            return date;
    }
};

const getCurrentPeriodAnchor = (startDateInput, frekuensi, todayInput) => {
    const startDate = normalizeDateOnly(startDateInput);
    const today = normalizeDateOnly(todayInput || new Date());
    if (!startDate || !today) return null;
    if (startDate > today) return startDate;

    if (frekuensi === "Harian") {
        return today;
    }

    if (frekuensi === "Mingguan") {
        const weekStart = new Date(today);
        const dayOfWeek = weekStart.getDay();
        const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        weekStart.setDate(weekStart.getDate() + diffToMonday);
        return weekStart > startDate ? weekStart : startDate;
    }

    if (frekuensi === "Bulanan") {
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
        return monthStart > startDate ? monthStart : startDate;
    }

    return startDate;
};

const calculateJadwalCountdown = ({
    startDate,
    frekuensi,
    target,
    selesaiUnit,
    today,
}) => {
    const todayDate = normalizeDateOnly(today || new Date());
    const periodAnchor = getCurrentPeriodAnchor(
        startDate,
        frekuensi,
        todayDate,
    );
    if (!todayDate || !periodAnchor) {
        return {
            periodFulfilled: false,
            currentPeriodStart: null,
            nextDueDate: null,
            daysRemaining: null,
        };
    }

    const normalizedTarget = Number(target);
    const normalizedSelesai = Number(selesaiUnit);
    const safeTarget =
        Number.isFinite(normalizedTarget) && normalizedTarget > 0
            ? normalizedTarget
            : 1;
    const safeSelesai =
        Number.isFinite(normalizedSelesai) && normalizedSelesai > 0
            ? normalizedSelesai
            : 0;

    const periodFulfilled = safeSelesai >= safeTarget;
    const dueDate = periodFulfilled
        ? addByFrequency(periodAnchor, frekuensi, 1)
        : periodAnchor;
    const daysRemaining = dueDate
        ? Math.floor((dueDate - todayDate) / 86400000)
        : null;

    return {
        periodFulfilled,
        currentPeriodStart: formatDateOnly(periodAnchor),
        nextDueDate: formatDateOnly(dueDate),
        daysRemaining,
    };
};

module.exports = {
    getWeekNumber,
    getMonthNumber,
    getYear,
    getDateComponents,
    calculateDaysDifference,
    normalizeDateOnly,
    formatDateOnly,
    addByFrequency,
    getCurrentPeriodAnchor,
    calculateJadwalCountdown,
};
