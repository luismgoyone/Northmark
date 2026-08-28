// executor/errors.ts
export const CATEGORIES = ['SIGNAL', 'DATA', 'STRATEGY', 'POSITION', 'RISK', 'SYMBOL', 'LOT', 'BROKER', 'DUPLICATE'] as const
export type ErrorCategory = (typeof CATEGORIES)[number]

/** A classified, non-silent failure. category ∈ the fixed taxonomy. */
export class ExecError extends Error {
  readonly category: ErrorCategory
  constructor(category: ErrorCategory, message: string) {
    super(message)
    this.name = 'ExecError'
    this.category = category
  }
}
