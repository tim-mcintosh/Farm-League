# Farm League development rules

These rules apply to the entire repository unless a more specific `AGENTS.md` is added inside a subdirectory.

## Product principles

- Build mobile-first. The primary game loop, navigation, overlays, HUD, and controls must be usable on current iPhone and Android browser sizes.
- Support both desktop and mobile controls. Every keyboard or pointer action required to play must have an equivalent touch control.
- Design games to last around five minutes unless a game specification explicitly says otherwise.
- Do not change existing mechanics, scoring, difficulty, timing, controls, or visual behavior unless the request explicitly calls for it.
- Every game must provide a clear **Back to Farm League** control.
- Do not implement planned platform features speculatively. Add accounts, leaderboards, daily challenges, achievements, statistics, settings, and multiplayer only from an approved specification.

## Architecture

- Keep each game self-contained in `games/<game-slug>/` with its own entry page and game-specific assets.
- Use `assets/shared/` only for genuinely shared site code and presentation. Avoid coupling one game to another game's implementation.
- Use stable, relative URLs so the static site works locally and from a subpath on static hosting.
- Start new games from `games/_template/`, then remove unused template code.
- Keep game state, input handling, update logic, rendering, and persistence concerns separated as a game grows. Split large files before they become difficult to test or review.
- Reserve server-dependent behavior behind explicit interfaces so games remain playable when platform services are unavailable.

## Code and quality standards

- Prefer semantic HTML, accessible names, visible keyboard focus, and adequate touch target sizes.
- Respect reduced-motion preferences for nonessential animation.
- Keep JavaScript free of implicit globals and check for syntax errors before handing off changes.
- Avoid dependencies unless they materially improve the project and their maintenance cost is justified.
- Test changed navigation and relative asset paths. For game changes, test start, restart, exit, timer completion, collisions, scoring, keyboard controls, and touch controls as applicable.
- Preserve Git history by moving files rather than deleting and recreating them when reorganising existing work.

## Change reporting

- Explain every file changed, created, moved, or removed.
- Call out behavior that could not be verified and any follow-up work recommended before the next game is added.
- Keep changes scoped to the request; do not bundle unrelated mechanic or design changes.
