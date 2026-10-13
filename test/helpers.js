export const t = (id, start, end, extra = {}) => ({ id, name: id, start, end, ...extra });
export const l = (from, to, type = 'FS', lag = 0) => ({ from, to, type, lag });
