// src/ui/format.test.ts
import { fmtPhtDateTime } from './format'

test('formats a UTC epoch as a short Philippine-time date + time', () => {
  // 13:50 UTC → 21:50 PHT (9:50 PM)
  expect(fmtPhtDateTime(Date.UTC(2026, 7, 23, 13, 50))).toMatch(/23 Aug.*9:50/)
})
