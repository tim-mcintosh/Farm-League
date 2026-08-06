import { createClient } from 'npm:@supabase/supabase-js@2.95.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const games = {
  'tractor-dash': { version: '1.1.0', maximumScore: 13000 },
  'feed-run': { version: '1.1.0', maximumScore: 12000 },
  'order-rush': { version: '1.1.0', maximumScore: 8000 },
  'fence-frenzy': { version: '1.1.0', maximumScore: 20000 },
} as const

type GameId = keyof typeof games

function response(body: object, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function safeActionTotal(actions: unknown) {
  if (!actions || typeof actions !== 'object' || Array.isArray(actions)) return null
  let total = 0
  for (const value of Object.values(actions)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    const points = (value as Record<string, unknown>).points
    const count = (value as Record<string, unknown>).count
    if (!Number.isSafeInteger(points) || (points as number) < 0) return null
    if (!Number.isSafeInteger(count) || (count as number) < 1) return null
    total += points as number
    if (!Number.isSafeInteger(total)) return null
  }
  return total
}

function validateSummary(summary: Record<string, unknown>) {
  const gameId = summary.gameId as GameId
  const rules = games[gameId]
  if (!rules || summary.gameVersion !== rules.version) return 'unsupported-game-version'
  if (summary.formatVersion !== 1 || summary.valid !== true || summary.configuredDurationSeconds !== 120) return 'invalid-round'
  if (summary.maximumLegitimateScore !== rules.maximumScore) return 'invalid-score-ceiling'
  if (!Array.isArray(summary.validationErrors) || summary.validationErrors.length > 0) return 'round-validation-errors'
  if (!Array.isArray(summary.rejectedEvents) || summary.rejectedEvents.length > 0) return 'rejected-score-events'
  if (typeof summary.sessionId !== 'string' || !/^[a-zA-Z0-9-]{8,100}$/.test(summary.sessionId)) return 'invalid-session'
  if (!Number.isSafeInteger(summary.finalScore) || (summary.finalScore as number) < 0 || (summary.finalScore as number) > rules.maximumScore) return 'invalid-score'
  if (typeof summary.elapsedSeconds !== 'number' || !Number.isFinite(summary.elapsedSeconds) || summary.elapsedSeconds < 0 || summary.elapsedSeconds > 121) return 'invalid-elapsed-time'
  if (typeof summary.outcome !== 'string' || summary.outcome.length < 1 || summary.outcome.length > 40) return 'invalid-outcome'
  const started = Date.parse(String(summary.startedAt || ''))
  const completed = Date.parse(String(summary.completedAt || ''))
  if (!Number.isFinite(started) || !Number.isFinite(completed) || completed < started) return 'invalid-timestamps'
  if (completed - started + 3000 < (summary.elapsedSeconds as number) * 1000) return 'round-completed-too-quickly'
  if (safeActionTotal(summary.actions) !== summary.finalScore) return 'score-events-do-not-match'
  return null
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return response({ error: 'method-not-allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const publishableKey = Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const authorization = req.headers.get('Authorization')
  if (!supabaseUrl || !publishableKey || !serviceRoleKey) return response({ error: 'server-not-configured' }, 500)
  if (!authorization) return response({ error: 'authentication-required' }, 401)

  const userClient = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: { user }, error: userError } = await userClient.auth.getUser()
  if (userError || !user) return response({ error: 'invalid-session' }, 401)

  let payload: Record<string, unknown>
  try { payload = await req.json() } catch { return response({ error: 'invalid-json' }, 400) }
  const summary = payload.summary
  if (!summary || typeof summary !== 'object' || Array.isArray(summary)) return response({ error: 'missing-summary' }, 400)
  const validationError = validateSummary(summary as Record<string, unknown>)
  if (validationError) return response({ error: validationError }, 422)

  const value = summary as Record<string, unknown>
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error: insertError } = await admin.from('game_scores').insert({
    user_id: user.id,
    game_id: value.gameId,
    session_id: value.sessionId,
    score: value.finalScore,
    game_version: value.gameVersion,
    outcome: value.outcome,
    elapsed_seconds: value.elapsedSeconds,
    round_started_at: value.startedAt,
    round_completed_at: value.completedAt,
    event_summary: value.actions,
  })
  if (insertError?.code === '23505') return response({ error: 'round-already-submitted' }, 409)
  if (insertError) return response({ error: 'score-save-failed' }, 500)

  const { data: bestScore, error: bestError } = await admin.rpc('record_best_score', {
    score_user_id: user.id,
    score_game_id: value.gameId,
    score_value: value.finalScore,
    score_game_version: value.gameVersion,
    score_session_id: value.sessionId,
  })
  if (bestError) return response({ error: 'best-score-save-failed' }, 500)
  return response({ saved: true, score: value.finalScore, bestScore })
})
