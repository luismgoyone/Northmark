/** Formats a timestamp as a short Philippine-time date + time, e.g. "23 Aug, 9:50 pm". */
export function fmtPhtDateTime(ms: number): string {
  return new Date(ms).toLocaleString('en-GB', {
    timeZone: 'Asia/Manila',
    day: '2-digit',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}
