(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.timeline = factory();
})(globalThis, () => {
  const DAY = 86400000, MIN_DAY = -719162, MAX_DAY = 2932896;
  const MIN_SPAN = 7, MAX_SPAN = 10958;
  function parse(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return null;
    const time = Date.parse(value + 'T00:00:00Z');
    if (!Number.isFinite(time)) return null;
    const date = new Date(time);
    return date.toISOString().slice(0, 10) === value ? time / DAY : null;
  }
  function format(day) { return new Date(Math.floor(day) * DAY).toISOString().slice(0, 10); }
  function validate(start, end) {
    if (!start && !end) return { startDate: null, endDate: null };
    const a = parse(start), b = parse(end);
    if (a === null || b === null) throw new Error('시작일과 종료일을 모두 올바르게 입력해 주세요.');
    if (a > b) throw new Error('종료일은 시작일보다 빠를 수 없습니다.');
    return { startDate: start, endDate: end };
  }
  function aggregate(items, projectId) {
    const children = new Map(), result = new Map();
    for (const item of items) if (item.projectId === projectId) { const key = item.parentId || null; if (!children.has(key)) children.set(key, []); children.get(key).push(item); }
    function visit(item) {
      if (item.type !== 'group') {
        const start = parse(item.startDate), end = parse(item.endDate);
        const valid = start !== null && end !== null && start <= end;
        const value = { start: valid ? start : null, end: valid ? end : null, undated: valid ? 0 : 1 }; result.set(item.id, value); return value;
      }
      let start = null, end = null, undated = 0;
      for (const child of children.get(item.id) || []) { const c = visit(child); undated += c.undated; if (c.start !== null) { start = start === null ? c.start : Math.min(start, c.start); end = end === null ? c.end : Math.max(end, c.end); } }
      const value = { start, end, undated }; result.set(item.id, value); return value;
    }
    for (const item of children.get(null) || []) visit(item);
    return result;
  }
  function limit(center, ppd, width) {
    width = Math.max(1, width); ppd = Math.max(width / MAX_SPAN, Math.min(width / MIN_SPAN, ppd));
    const half = width / ppd / 2;
    return { center: Math.max(MIN_DAY + half, Math.min(MAX_DAY + 1 - half, center)), ppd };
  }
  function zoom(center, ppd, width, x, delta) {
    const before = limit(center, ppd, width), offset = Math.max(0, Math.min(width, x)) - width / 2;
    const newPpd = Math.max(width / MAX_SPAN, Math.min(width / MIN_SPAN, before.ppd * Math.exp(-Math.max(-120, Math.min(120, delta)) * .002)));
    return limit(before.center + offset / before.ppd - offset / newPpd, newPpd, width);
  }
  function initial(items, projectId, width, today = Math.floor(Date.now() / DAY)) {
    const values = [...aggregate(items, projectId).values()].filter(v => v.start !== null);
    let left, right;
    if (values.length) { left = Math.min(...values.map(v => v.start)); right = Math.max(...values.map(v => v.end)) + 1; const margin = (right-left) * .05; left -= margin; right += margin; }
    else { left = today - 45; right = today + 45; }
    const span = Math.max(MIN_SPAN, Math.min(MAX_SPAN, right - left));
    return limit((left + right) / 2, Math.max(1, width) / span, width);
  }
  function yearBands(center, ppd, width) {
    const left = center - width / ppd / 2, right = center + width / ppd / 2;
    const visibleStart = Math.max(MIN_DAY, Math.floor(left));
    let year = new Date(visibleStart * DAY).getUTCFullYear();
    const bands = [];
    while (year <= 9999) {
      const begin = parse(`${String(year).padStart(4, '0')}-01-01`);
      if (begin >= right) break;
      const end = year === 9999 ? MAX_DAY + 1 : parse(`${String(year + 1).padStart(4, '0')}-01-01`);
      const x = Math.max(0, (begin - left) * ppd), edge = Math.min(width, (end - left) * ppd);
      if (edge > x) bands.push({year, left:x, width:edge-x});
      year++;
    }
    return bands;
  }
  function ticks(center, ppd, width, previous) {
    const sizes = [1, 7, 30.4375, 91.3125, 365.25];
    const dayThreshold = width / 90;
    const weekThreshold = Math.min(65, dayThreshold * 7 * .8);
    const monthThreshold = Math.min(65, weekThreshold / 7 * 30.4375 * .8);
    const thresholds = [dayThreshold, weekThreshold, monthThreshold, 65, 65];
    let level = previous == null ? 4 : previous;
    while (level > 0 && ppd * sizes[level - 1] >= thresholds[level - 1] * (previous == null ? 1 : 1.1)) level--;
    while (level < 4 && ppd * sizes[level] < thresholds[level] * (previous == null ? 1 : .9)) level++;
    const left = Math.max(MIN_DAY, Math.floor(center - width / ppd / 2)), right = Math.min(MAX_DAY, Math.ceil(center + width / ppd / 2));
    let cursor = left;
    const yearStep = level === 4 ? ([1, 2, 5, 10, 20, 50].find(n => n * 365.25 * ppd >= 65) || 50) : 1;
    if (level === 1) cursor -= (cursor + 3 + 7000000) % 7;
    if (level >= 2) { const d = new Date(left * DAY); let y = d.getUTCFullYear(), m = d.getUTCMonth(); if (level === 3) m -= m % 3; if (level === 4) { m = 0; y = Math.max(1, Math.floor(y / yearStep) * yearStep); } const v = new Date(0); v.setUTCFullYear(y, m, 1); v.setUTCHours(0,0,0,0); cursor = v.getTime()/DAY; }
    const out = [];
    while (cursor <= right && out.length < 2000) {
      if (cursor >= MIN_DAY) {
        const d = new Date(cursor * DAY), y = d.getUTCFullYear(), m = d.getUTCMonth()+1, day = d.getUTCDate();
        const label = level === 4 ? `${y}년` : level === 3 ? `${y}년 ${Math.floor((m-1)/3)+1}분기` : level === 2 ? `${y}.${String(m).padStart(2,'0')}` : `${m}/${day}`;
        out.push({ day:cursor, label });
      }
      if (level <= 1) cursor += level === 0 ? 1 : 7;
      else { const d = new Date(cursor*DAY); d.setUTCMonth(d.getUTCMonth() + (level === 2 ? 1 : level === 3 ? 3 : 12 * yearStep)); cursor = d.getTime()/DAY; }
    }
    return { level, ticks: out };
  }
  function dayLabelInterval(ppd) { return Math.max(1, Math.ceil(48 / ppd)); }
  return { dayLabelInterval, DAY, MIN_DAY, MAX_DAY, MIN_SPAN, MAX_SPAN, parse, format, validate, aggregate, limit, zoom, initial, ticks, yearBands };
});
