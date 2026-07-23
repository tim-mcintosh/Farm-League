# Feed Run

Feed Run is a two-minute resource-management game. Collect one food item at a time, deliver it to a compatible animal pen, and prevent any animal group from losing all three hearts.

The contained farm is rendered with original top-down canvas artwork. The farmer enters each fenced paddock through its gate, while one decorative animal actor wanders inside each pen without affecting gameplay collisions or scoring.

## Files

- `index.html` contains the HUD, game canvas, overlays, navigation, and mobile controls.
- `styles.css` contains the mobile-first game presentation and responsive layouts.
- `config.js` contains all balancing values, food definitions, scoring, hunger drain, and difficulty phases.
- `game.js` contains input, game state, spawning, fairness, hunger, delivery, scoring, rendering, persistence, and screen flow.

## Balancing

Adjust gameplay through `config.js`. Food values, animal drain rates, phase multipliers, expiry, visible food limits, scoring, player speed, and round duration should not be duplicated in the game loop.

## Sound integration

Gameplay emits `feedrun:sound` events on `document`. The event detail contains a `type` such as `pickup`, `delivery`, `wrongAnimal`, `hungerWarning`, `heartLost`, `victory`, or `gameOver`. A future shared sound system can listen for these events without changing game mechanics.
