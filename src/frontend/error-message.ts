export function errorMessage(error: unknown, fallback = '操作未完成，请退出并重新进入。'): string {
  // Helper functions run in the host page, so their errors cross an iframe realm.
  // Read only a bounded message; never serialize a provider response or stack.
  try {
    const value = typeof error === 'string' ? error
      : error && typeof error === 'object' && 'message' in error ? error.message : '';
    if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 600);
  } catch { /* A rejected value may expose a throwing message getter. */ }
  return fallback;
}
