# Accounts and cloud scores

Farm League uses Supabase Auth for email/password accounts and Supabase Postgres for private score history. Guest play remains fully local.

Account email addresses remain in Supabase Auth and are not duplicated in public profile data. Profiles contain a unique, case-insensitive username and an optional full name. A blank signup username is generated from the email prefix with a collision-safe suffix when needed. Prize contact and delivery details are intentionally deferred to a private prize-claim workflow.

## Guest and signed-in rules

- A round is cloud-eligible only when the same authenticated user is present at both its start and completion.
- Guest scores are never uploaded or imported after sign-in.
- Local best scores continue to work for every player, including when Supabase is unavailable.
- Account score failures never interrupt or invalidate a local game result.

## Browser modules

- `assets/shared/supabase-config.js` contains only the public project URL and publishable browser key.
- `assets/shared/auth.js` owns the Supabase client and authentication actions.
- `assets/shared/auth-ui.js` updates shared navigation for signed-in and guest states.
- `assets/shared/cloud-scores.js` captures the starting user, submits completed summaries and reads private best scores.

The secret/service-role key must never be added to these files or any other browser asset.

## Database deployment

Apply all migrations in `supabase/migrations/` in order. They create profiles, the game/version catalogue, score history, best scores, explicit grants, RLS policies and the higher-score-only database function.

With an authenticated Supabase CLI:

```bash
supabase link --project-ref fivzzyrsluhzujejysra
supabase db push
supabase functions deploy submit-score
```

The hosted function receives its standard Supabase URL, public key and service-role key from the Supabase runtime. Do not create a client-side copy of the service-role key.

## Security boundary

The score endpoint verifies the authenticated user, supported game/version, score ceiling, elapsed time, timestamps, standardized outcome, score-event total and duplicate session ID. It stores score actions separately from game-specific round facts through the service role because browser roles have no insert/update grant on score tables.

This remains basic client-result validation, not cheat-proof gameplay. A later competitive leaderboard should issue server-generated round tokens and validate a compact ordered event stream as described in `docs/client-score-security.md`.
