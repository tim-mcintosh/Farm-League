# Farm Defence

Farm Defence is a two-minute, movement-only farm management game. Harvest crops, repair rabbit-damaged fences, and buy sheepdogs and fence upgrades from in-world workshop stations.

## Controls

- Desktop: Arrow keys or WASD.
- Mobile: On-screen directional controls.
- Harvesting, repairing, purchasing, and dog placement are automatic proximity interactions.

After purchasing a dog, walk to the desired patrol point and stand still briefly to place it.

## Architecture

- `config.js` centralises all balance and pricing.
- `game.js` owns lifecycle, state, controls, interactions, simulation, scoring, and persistence.
- `renderer.js` owns all canvas presentation and visual polish.
- `styles.css` owns the mobile-first page, overlays, HUD, and touch controls.

Farm Defence emits `farmdefence:sound` events as a stable hook for future audio integration. No server or external dependency is required.
