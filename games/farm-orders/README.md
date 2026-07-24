# Farm Orders

Farm Orders is a two-minute solo packing game. Read each delivery order, collect products from unlimited-stock stations, deposit them at the packing bench, and submit an exact box before the driver leaves.

Balancing is centralized in `config.js`. `game.js` separates state, controls, orders, interactions, validation, scoring, vehicle transitions, persistence, and canvas rendering.

Desktop controls: arrows/WASD to move, Space/Enter to use, Q to submit, and R to empty the box. Mobile provides equivalent touch controls.

Gameplay emits `farmorders:sound` events for future audio integration.
