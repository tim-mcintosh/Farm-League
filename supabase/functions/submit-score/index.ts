import { createClient } from 'npm:@supabase/supabase-js@2.95.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type GameId = 'tractor-dash' | 'feed-run' | 'order-rush' | 'fence-frenzy'
type GameRules = { gameId: GameId; version: string; maximumScore: number; roundSeconds: number }

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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normaliseOutcome(gameId: GameId, outcome: unknown, facts: Record<string, unknown>) {
  const supplied = String(outcome || '')
  if (gameId === 'tractor-dash') {
    if (supplied === 'completed' || supplied === 'timer') return { code: 'completed', detail: {} }
    if (supplied === 'collision' || supplied === 'cow' || supplied === 'sheep') {
      const collidedWith = supplied === 'collision' ? facts.collidedWith : supplied
      if (collidedWith !== 'cow' && collidedWith !== 'sheep') return null
      return { code: 'collision', detail: { collidedWith } }
    }
  }
  if (gameId === 'feed-run') {
    if (supplied === 'completed' || supplied === 'victory') return { code: 'completed', detail: {} }
    if (supplied === 'starvation' || supplied === 'defeat') {
      const failedAnimal = facts.failedAnimal
      return { code: 'starvation', detail: typeof failedAnimal === 'string' ? { failedAnimal } : {} }
    }
  }
  if ((gameId === 'order-rush' || gameId === 'fence-frenzy') && supplied === 'completed') {
    return { code: 'completed', detail: {} }
  }
  return null
}

function validateSummary(summary: Record<string, unknown>, rules: GameRules) {
  const gameId = summary.gameId as GameId
  if (gameId !== rules.gameId || summary.gameVersion !== rules.version) return 'unsupported-game-version'
  if (summary.formatVersion !== 1 || summary.valid !== true || summary.configuredDurationSeconds !== rules.roundSeconds) return 'invalid-round'
  if (summary.maximumLegitimateScore !== rules.maximumScore) return 'invalid-score-ceiling'
  if (!Array.isArray(summary.validationErrors) || summary.validationErrors.length > 0) return 'round-validation-errors'
  if (!Array.isArray(summary.rejectedEvents) || summary.rejectedEvents.length > 0) return 'rejected-score-events'
  if (typeof summary.sessionId !== 'string' || !/^[a-zA-Z0-9-]{8,100}$/.test(summary.sessionId)) return 'invalid-session'
  if (!Number.isSafeInteger(summary.finalScore) || (summary.finalScore as number) < 0 || (summary.finalScore as number) > rules.maximumScore) return 'invalid-score'
  if (typeof summary.elapsedSeconds !== 'number' || !Number.isFinite(summary.elapsedSeconds) || summary.elapsedSeconds < 0 || summary.elapsedSeconds > 121) return 'invalid-elapsed-time'
  if (!isPlainObject(summary.facts)) return 'invalid-round-facts'
  if (!normaliseOutcome(gameId, summary.outcome, summary.facts)) return 'invalid-outcome'
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
  const value = summary as Record<string, unknown>
  const gameId = value.gameId
  const gameVersion = value.gameVersion
  if (typeof gameId !== 'string' || typeof gameVersion !== 'string') return response({ error: 'unsupported-game-version' }, 422)

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: versionRules, error: versionError } = await admin
    .from('game_versions')
    .select('game_id,version,maximum_score,round_seconds')
    .eq('game_id', gameId)
    .eq('version', gameVersion)
    .eq('enabled_for_submission', true)
    .maybeSingle()
  if (versionError) return response({ error: 'game-rules-unavailable' }, 500)
  if (!versionRules) return response({ error: 'unsupported-game-version' }, 422)

  const rules: GameRules = {
    gameId: versionRules.game_id as GameId,
    version: versionRules.version,
    maximumScore: versionRules.maximum_score,
    roundSeconds: versionRules.round_seconds,
  }
  const validationError = validateSummary(value, rules)
  if (validationError) return response({ error: validationError }, 422)

  const facts = value.facts as Record<string, unknown>
  const outcome = normaliseOutcome(value.gameId as GameId, value.outcome, facts)
  if (!outcome) return response({ error: 'invalid-outcome' }, 422)
  const { error: insertError } = await admin.from('game_scores').insert({
    user_id: user.id,
    game_id: value.gameId,
    session_id: value.sessionId,
    score: value.finalScore,
    game_version: value.gameVersion,
    outcome_code: outcome.code,
    outcome_detail: outcome.detail,
    elapsed_seconds: value.elapsedSeconds,
    round_started_at: value.startedAt,
    round_completed_at: value.completedAt,
    event_summary: value.actions,
    round_facts: facts,
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
