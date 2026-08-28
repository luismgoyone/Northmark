// executor/gate.ts
export function executionGate(env: Record<string, string | undefined>): { enabled: boolean; reason: string } {
  if (env.EXEC_ENABLED !== 'true') return { enabled: false, reason: 'EXEC_ENABLED is not true (dormant)' }
  if (!env.METAAPI_TOKEN || !env.METAAPI_ACCOUNT_ID) return { enabled: false, reason: 'missing METAAPI_TOKEN/METAAPI_ACCOUNT_ID' }
  return { enabled: true, reason: 'enabled' }
}
