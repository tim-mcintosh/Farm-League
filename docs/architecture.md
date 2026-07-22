# Architecture direction

## Current boundaries

Farm League is currently a static site with two layers:

- The **platform layer** owns the homepage, shared branding, navigation, and future service integration.
- The **game layer** owns each game's state, input, update loop, rendering, rules, and game-specific assets.

Games must remain independently playable. Shared platform failures should not prevent a local game session from starting.

## Planned extension points

When platform features are approved, introduce them behind small interfaces instead of importing service logic throughout game loops:

- A session provider for optional authenticated users.
- A score submission interface with offline/error handling.
- A challenge provider that supplies versioned game parameters.
- An achievements/statistics event interface fed by explicit game events.
- A shared settings provider for sound and accessibility preferences.
- A separately designed real-time transport for games that support multiplayer.

The specific APIs and data models should be designed when requirements and hosting choices are known. No placeholder implementation is needed before then.

## Deployment assumptions

All current links are relative so the site can be served from a domain root, a subdirectory, or a simple local static server. If a build system or application router is introduced later, preserve direct URLs to each game's `index.html` or add equivalent route handling.
