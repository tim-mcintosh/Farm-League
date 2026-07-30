# My Farm

My Farm is a platform page and grid-based farm viewer/builder. It is intentionally not a movement game in this version.

## Modules

- `data.js` owns the versioned `farmLeague.myFarm.v1` local-storage schema, starter inventory, object catalogue and safe persistence.
- `placement.js` owns the 12 × 8 grid, bounds checks, overlap checks, object hit testing and placement sanitisation.
- `renderer.js` owns the canvas scene and temporary code-drawn object artwork.
- `ui.js` owns selection, build/move/store/cancel flows, accessible HTML controls and save coordination.
- `styles.css` owns the responsive page and builder presentation.

Canvas objects use a two-step double activation: double-click or double-tap an object to begin moving it, then double-click or double-tap a valid destination to save the move. The visible Move and Place controls remain available as accessible alternatives.

## Save schema

```js
{
  version: 1,
  coins: 250,
  inventory: { tree: 5 },
  placed: [{ id: "tree-...", type: "tree", x: 4, y: 2 }]
}
```

Coordinates are zero-based grid positions. Object dimensions come from the catalogue rather than being duplicated in save data.

## Future boundaries

Accounts, backend synchronisation, crop timers, resource systems and player movement are deliberately excluded. Future versions should migrate saved data explicitly rather than silently changing version 1 records. Final artwork can replace the renderer’s placeholders without changing placement or persistence modules.
