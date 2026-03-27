const parsePagination = (query = {}, defaultLimit = 20, maxLimit = 100) => {
    const hasLimit = query.limit !== undefined;
    const hasOffset = query.offset !== undefined;
    const hasPagination = hasLimit || hasOffset;

    if (!hasPagination) {
        return {
            hasPagination: false,
            limit: null,
            offset: null,
        };
    }

    const parsedLimit = Number.parseInt(query.limit, 10);
    const parsedOffset = Number.parseInt(query.offset, 10);

    const limit = Number.isFinite(parsedLimit)
        ? Math.min(Math.max(parsedLimit, 1), maxLimit)
        : defaultLimit;
    const offset = Number.isFinite(parsedOffset)
        ? Math.max(parsedOffset, 0)
        : 0;

    return {
        hasPagination: true,
        limit,
        offset,
    };
};

const buildMeta = ({ total, limit, offset, itemCount }) => ({
    total,
    limit,
    offset,
    has_more: offset + itemCount < total,
});

module.exports = {
    parsePagination,
    buildMeta,
};
