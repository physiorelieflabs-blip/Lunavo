export function money(value: number | null | undefined, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(value ?? 0);
}

export function compactMoney(value: number | null | undefined, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 }).format(value ?? 0);
}

export function dateLabel(value: string | undefined) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

export function timeAgo(value: string | undefined) {
  if (!value) return 'Recently';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Recently';
  const formatter = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const today = formatter.format(new Date());
  const eventDay = formatter.format(date);
  const [todayYear, todayMonth, todayDate] = today.split('-').map(Number);
  const [eventYear, eventMonth, eventDate] = eventDay.split('-').map(Number);
  const days = Math.floor(
    (Date.UTC(todayYear, todayMonth - 1, todayDate) -
      Date.UTC(eventYear, eventMonth - 1, eventDate)) /
      86400000,
  );
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return `${days} days ago`;
}

export function initials(name: string | undefined) {
  return (name || 'TS').split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase();
}