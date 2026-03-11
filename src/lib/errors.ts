// Safe error message for API responses - never leak internals in production
export function safeErrorMessage(err: unknown, fallback = 'Internal server error'): string {
  if (process.env.NODE_ENV !== 'production') {
    return (err as Error)?.message || fallback
  }
  // In production, only return known safe messages
  const msg = (err as Error)?.message || ''
  const safeMessages = ['Unauthorized', 'Forbidden', 'Account disabled', 'Not found']
  if (safeMessages.includes(msg)) return msg
  return fallback
}
