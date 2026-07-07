/** "FRIDAY, JULY 4" — uppercase weekday + month + day. */
export function formatDateEyebrow(date: Date | string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(dateObj);
  const month = new Intl.DateTimeFormat('en-US', { month: 'long' }).format(dateObj);
  return `${weekday}, ${month} ${dateObj.getDate()}`.toUpperCase();
}

/** "Friday, July 4" — friendly (non-uppercase) weekday + month + day, used
 * for nav-bar titles (e.g. EntryDetailScreen), as opposed to the all-caps
 * eyebrow form above used inline in section headers. */
export function formatFriendlyDate(date: Date | string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(dateObj);
  const month = new Intl.DateTimeFormat('en-US', { month: 'long' }).format(dateObj);
  return `${weekday}, ${month} ${dateObj.getDate()}`;
}
