# Order Rush

Order Rush is a two-minute movement-only packing game. Collect physical products from the produce zone, place them into one of three boxes, carry a correctly sealed box to the truck, and abandon mistakes before the driver leaves.

Balancing is centralized in `config.js`. `game.js` separates state, controls, orders, interactions, validation, scoring, vehicle transitions, persistence, and canvas rendering.

Desktop controls use arrows/WASD. Mobile provides an equivalent touch D-pad. Pickup, packing, box collection, and delivery are automatic.

Gameplay emits `orderrush:sound` events for future audio integration.
