/** "FRIDAY, JULY 4" — uppercase weekday + month + day. */
export function formatDateEyebrow(date: Date | string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(dateObj);
  const month = new Intl.DateTimeFormat('en-US', { month: 'long' }).format(dateObj);
  return `${weekday}, ${month} ${dateObj.getDate()}`.toUpperCase();
}
