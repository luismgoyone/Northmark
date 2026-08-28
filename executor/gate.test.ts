// executor/gate.test.ts
import { describe, expect, it } from 'vitest'
import { executionGate } from './gate'

describe('executionGate', () => {
  it('dormant unless EXEC_ENABLED === "true"', () => {
    expect(executionGate({}).enabled).toBe(false)
    expect(executionGate({ EXEC_ENABLED: 'false' }).enabled).toBe(false)
  })
  it('needs MetaApi creds when enabled', () => {
    expect(executionGate({ EXEC_ENABLED: 'true' }).enabled).toBe(false)
    expect(executionGate({ EXEC_ENABLED: 'true', METAAPI_TOKEN: 't', METAAPI_ACCOUNT_ID: 'a' }).enabled).toBe(true)
  })
})
