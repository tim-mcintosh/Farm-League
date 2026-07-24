# Farm Defence

Farm Defence is a two-minute, movement-only farm management game. Harvest crops, defend them from rabbits and crows, repair the arena's border fence, and buy sheepdogs and fence upgrades from in-world stations.

## Controls

- Desktop: Arrow keys or WASD.
- Mobile: On-screen directional controls.
- Harvesting, repairing, purchasing, pest-scaring, and dog placement are automatic proximity interactions.

Rabbits stay on the farm and continue eating until the farmer touches them or a dog chases them away. A fence section cannot be repaired while a rabbit is still breaking it.

Crows fly over fences and attack crops directly. Like rabbits, they remain until the farmer or a dog chases them off the map.

After purchasing a dog, walk to the desired starting point and stand still briefly to place it. Dogs pursue the nearest rabbit that enters the farm, then return to their starting point. Each dog tier has a distinct coat, higher movement speed, and larger scare radius. Fence tiers gain additional rails, stronger posts, and increased durability.

## Architecture

- `config.js` centralises all balance and pricing.
- `game.js` owns lifecycle, state, controls, interactions, simulation, scoring, and persistence.
- `renderer.js` owns all canvas presentation and visual polish.
- `styles.css` owns the mobile-first page, overlays, HUD, and touch controls.

Farm Defence emits `farmdefence:sound` events as a stable hook for future audio integration. No server or external dependency is required.
