// executor/redact.ts — strip the shared webhook secret before any raw body is logged.

/**
 * Return `rawBody` with the `secret` field's value masked to `"***"`.
 *
 * Pure. Tries structured JSON first: if the body parses to a plain object that
 * carries a `secret` key, that value is replaced and the object re-stringified.
 * If parsing fails, falls back to a regex that masks a `"secret":"…"` field in
 * place. Anything without a secret field is returned unchanged.
 */
export function redactSecret(rawBody: string): string {
  try {
    const parsed: unknown = JSON.parse(rawBody)
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) && 'secret' in parsed) {
      return JSON.stringify({ ...(parsed as Record<string, unknown>), secret: '***' })
    }
    return rawBody
  } catch {
    return rawBody.replace(/"secret"\s*:\s*"[^"]*"/, '"secret":"***"')
  }
}
