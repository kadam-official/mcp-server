export function resolvePeriodToDates(
  period: string,
): { dateFrom: string; dateTo: string } {
  const now = new Date();
  const toDate = (d: Date) => d.toISOString().slice(0, 10);

  switch (period) {
    case "today":
      return { dateFrom: toDate(now), dateTo: toDate(now) };
    case "yesterday": {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      const s = toDate(y);
      return { dateFrom: s, dateTo: s };
    }
    case "7days":
    case "week": {
      const e = new Date(now);
      const s = new Date(now);
      s.setDate(s.getDate() - 6);
      return { dateFrom: toDate(s), dateTo: toDate(e) };
    }
    case "30days":
    case "month": {
      const e = new Date(now);
      const s = new Date(now);
      s.setDate(s.getDate() - 29);
      return { dateFrom: toDate(s), dateTo: toDate(e) };
    }
    default:
      return resolvePeriodToDates("7days");
  }
}
