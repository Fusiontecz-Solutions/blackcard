import {
  eachDayOfInterval,
  eachMonthOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
  subWeeks,
} from 'date-fns';

export function groupInflowByTimeframe(
  inflowData: { date: string; amount: string }[],
  timeframe: 'daily' | 'weekly' | 'monthly',
): { name: string; inflow: number }[] {
  const now = new Date();

  if (timeframe === 'daily') {
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

    return days.map((day) => {
      const dateKey = format(day, 'yyyy-MM-dd');
      const total = inflowData
        .filter((d) => d.date.startsWith(dateKey))
        .reduce((sum, d) => sum + parseFloat(d.amount), 0);

      return { name: dateKey, inflow: total };
    });
  }

  if (timeframe === 'weekly') {
    const startThisWeek = startOfWeek(now, { weekStartsOn: 0 });
    const endToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    const w3Start = subWeeks(startThisWeek, 3);
    const w3End = endOfWeek(w3Start, { weekStartsOn: 0 });
    const w2Start = subWeeks(startThisWeek, 2);
    const w2End = endOfWeek(w2Start, { weekStartsOn: 0 });
    const w1Start = subWeeks(startThisWeek, 1);
    const w1End = endOfWeek(w1Start, { weekStartsOn: 0 });
    const w0Start = startThisWeek;
    const w0End = endToday;

    const formatLabel = (s: Date, e: Date) => {
      const sameMonth = s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear();
      return sameMonth
        ? `${format(s, 'd')}-${format(e, 'd MMM')}`
        : `${format(s, 'd MMM')}-${format(e, 'd MMM')}`;
    };

    const buckets = [
      { start: w3Start, end: w3End, label: formatLabel(w3Start, w3End) },
      { start: w2Start, end: w2End, label: formatLabel(w2Start, w2End) },
      { start: w1Start, end: w1End, label: formatLabel(w1Start, w1End) },
      { start: w0Start, end: w0End, label: formatLabel(w0Start, w0End) },
    ];

    return buckets.map((b) => {
      const totalInflow = inflowData
        .filter((d) => {
          const date = parseISO(d.date);
          return date >= b.start && date <= b.end;
        })
        .reduce((sum, d) => sum + parseFloat(d.amount), 0);

      return {
        name: b.label,
        inflow: totalInflow,
      };
    });
  }

  if (timeframe === 'monthly') {
    const start = subMonths(now, 11);
    const end = now;
    const months = eachMonthOfInterval({ start, end });

    return months.map((month) => {
      const monthStart = startOfMonth(month);
      const monthEnd = endOfMonth(month);

      const total = inflowData
        .filter((d) => {
          const parsed = parseISO(d.date);
          return parsed >= monthStart && parsed <= monthEnd;
        })
        .reduce((sum, d) => sum + parseFloat(d.amount), 0);

      return {
        name: format(monthStart, 'yyyy-MM-dd'),
        inflow: total,
      };
    });
  }

  return [];
}

export function groupOutflowByTimeframe(
  outflowData: { date: string; amount: string }[],
  timeframe: 'daily' | 'weekly' | 'monthly',
): { name: string; outflow: number }[] {
  const now = new Date();

  if (timeframe === 'daily') {
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

    return days.map((day) => {
      const dateKey = format(day, 'yyyy-MM-dd');
      const total = outflowData
        .filter((d) => d.date.startsWith(dateKey))
        .reduce((sum, d) => sum + parseFloat(d.amount), 0);

      return { name: dateKey, outflow: total };
    });
  }

  if (timeframe === 'weekly') {
    const startThisWeek = startOfWeek(now, { weekStartsOn: 0 });
    const endToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    const w3Start = subWeeks(startThisWeek, 3);
    const w3End = endOfWeek(w3Start, { weekStartsOn: 0 });
    const w2Start = subWeeks(startThisWeek, 2);
    const w2End = endOfWeek(w2Start, { weekStartsOn: 0 });
    const w1Start = subWeeks(startThisWeek, 1);
    const w1End = endOfWeek(w1Start, { weekStartsOn: 0 });
    const w0Start = startThisWeek;
    const w0End = endToday;

    const formatLabel = (s: Date, e: Date) => {
      const sameMonth = s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear();
      return sameMonth
        ? `${format(s, 'd')}-${format(e, 'd MMM')}`
        : `${format(s, 'd MMM')}-${format(e, 'd MMM')}`;
    };

    const buckets = [
      { start: w3Start, end: w3End, label: formatLabel(w3Start, w3End) },
      { start: w2Start, end: w2End, label: formatLabel(w2Start, w2End) },
      { start: w1Start, end: w1End, label: formatLabel(w1Start, w1End) },
      { start: w0Start, end: w0End, label: formatLabel(w0Start, w0End) },
    ];

    return buckets.map((b) => {
      const totalOutflow = outflowData
        .filter((d) => {
          const date = parseISO(d.date);
          return date >= b.start && date <= b.end;
        })
        .reduce((sum, d) => sum + parseFloat(d.amount), 0);

      return {
        name: b.label,
        outflow: totalOutflow,
      };
    });
  }

  if (timeframe === 'monthly') {
    const start = subMonths(now, 11);
    const end = now;
    const months = eachMonthOfInterval({ start, end });

    return months.map((month) => {
      const monthStart = startOfMonth(month);
      const monthEnd = endOfMonth(month);

      const total = outflowData
        .filter((d) => {
          const parsed = parseISO(d.date);
          return parsed >= monthStart && parsed <= monthEnd;
        })
        .reduce((sum, d) => sum + parseFloat(d.amount), 0);

      return { name: format(monthStart, 'yyyy-MM-dd'), outflow: total };
    });
  }

  return [];
}
