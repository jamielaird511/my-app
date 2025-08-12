export function getSessionId(): string {
  const KEY = 'importium_session_id';
  let id = typeof window !== 'undefined' ? localStorage.getItem(KEY) : null;
  if (!id) {
    id = crypto.randomUUID();
    if (typeof window !== 'undefined') localStorage.setItem(KEY, id);
  }
  return id!;
}
