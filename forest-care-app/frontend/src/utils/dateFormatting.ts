export function formatDate(date: string): string {
  if (!date) return '-';
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString('fi-FI');
}

export function addYears(date: string, years: number): string {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  parsed.setFullYear(parsed.getFullYear() + years);
  const year = parsed.getFullYear();
  const month = `${parsed.getMonth() + 1}`.padStart(2, '0');
  const day = `${parsed.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatDateRange(start: string, end: string): string {
  if (!start && !end) return '-';
  if (start && !end) return formatDate(start);
  if (!start && end) return formatDate(end);
  if (start === end) return formatDate(start);
  return `${formatDate(start)}-${formatDate(end)}`;
}
