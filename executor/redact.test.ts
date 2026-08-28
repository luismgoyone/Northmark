// executor/redact.test.ts — redactSecret must never let the shared secret reach a log
import { describe, expect, it } from 'vitest'
import { redactSecret } from './redact'

describe('redactSecret', () => {
  it('masks the secret value in a JSON object', () => {
    const out = redactSecret(JSON.stringify({ secret: 'topsecret', event_id: 'e1' }))
    expect(out).not.toContain('topsecret')
    expect(JSON.parse(out).secret).toBe('***')
  })
  it('preserves other/nested fields while masking the secret', () => {
    const out = redactSecret(JSON.stringify({ secret: 'S', symbol: 'XAUUSD', meta: { a: 1, b: [2, 3] } }))
    const parsed = JSON.parse(out)
    expect(parsed.secret).toBe('***')
    expect(parsed.symbol).toBe('XAUUSD')
    expect(parsed.meta).toEqual({ a: 1, b: [2, 3] })
  })
  it('leaves an object without a secret key unchanged', () => {
    const src = JSON.stringify({ event_id: 'e1', symbol: 'XAUUSD' })
    const out = redactSecret(src)
    expect(JSON.parse(out)).toEqual({ event_id: 'e1', symbol: 'XAUUSD' })
    expect(out).not.toContain('***')
  })
  it('regex-masks the secret field in malformed JSON', () => {
    const out = redactSecret('{"secret":"abc", oops not json')
    expect(out).not.toContain('abc')
    expect(out).toContain('"secret":"***"')
  })
  it('regex-masks with whitespace around the colon in malformed JSON', () => {
    const out = redactSecret('{ "secret" : "abc" , broken')
    expect(out).not.toContain('abc')
    expect(out).toContain('"secret":"***"')
  })
  it('returns a non-JSON string with no secret field as-is', () => {
    expect(redactSecret('plain text no secret here')).toBe('plain text no secret here')
  })
})
