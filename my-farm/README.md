# My Farm

My Farm is a platform page and grid-based farm viewer/builder. It is intentionally not a movement game in this version.

## Modules

- `data.js` owns the versioned `farmLeague.myFarm.v2` local-storage schema, starter inventory, object catalogue and safe persistence.
- `placement.js` owns the 12 × 8 grid, bounds checks, overlap checks, object hit testing and placement sanitisation.
- `renderer.js` owns the canvas scene and temporary code-drawn object artwork.
- `ui.js` owns selection, build/move/store/cancel flows, accessible HTML controls and save coordination.
- `styles.css` owns the responsive page and builder presentation.

Canvas objects use a two-step double activation: double-click or double-tap an object to begin moving it, then double-click or double-tap a valid destination to save the move. The visible Move and Place controls remain available as accessible alternatives.

## Save schema

```js
{
  version: 2,
  coins: 250,
  inventory: { fence: 10, stone: 1, mailbox: 1 },
  placed: [{ id: "tree-...", type: "tree", x: 4, y: 2 }]
}
```

Coordinates are zero-based grid positions. Object dimensions come from the catalogue rather than being duplicated in save data.

The free starter allowance is one small farmhouse, one garden bed, one tree, ten fence sections, one stone and one mailbox. The farmhouse, garden and tree begin on the farm; the remaining items begin in storage. Version 1 saves migrate to this allowance while preserving valid placed objects.

## Future boundaries

Accounts, backend synchronisation, purchasing, crop timers, resource systems and player movement are deliberately excluded. Future versions should migrate saved data explicitly rather than silently replacing version 2 records. Final artwork can replace the renderer’s placeholders without changing placement or persistence modules.
