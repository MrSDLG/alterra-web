let table = null;

async function all() {
  if (!table) table = fetch('events.json').then(r => (r.ok ? r.json() : {})).catch(() => ({}));
  return table;
}

export async function getEvents(row) {
  const list = (await all())[row.id] || [];
  return list.slice().sort((a, b) => new Date(b.at) - new Date(a.at));
}

export function ago(iso) {
  const s = (Date.now() - new Date(iso)) / 1000;
  if (s < 90) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  if (s < 86400 * 14) return `${Math.round(s / 86400)} days ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
