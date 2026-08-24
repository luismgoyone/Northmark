// api/sim-state.ts
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { kv } from '@vercel/kv'
import { defaultConfig } from '../src/config'
import { simConfigFrom } from '../src/sim/config'
import { initBlob, type SimBlob } from '../src/serverTick'

const KEY = 'sim:v1'

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const blob = ((await kv.get<SimBlob>(KEY)) as SimBlob | null) ?? initBlob(simConfigFrom(defaultConfig))
  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60')
  res.status(200).json({
    state: blob.state,
    meta: { limitReachedAt: blob.limitReachedAt, updatedAt: blob.updatedAt },
  })
}
