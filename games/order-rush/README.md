# Order Rush

Order Rush is a two-minute movement-only packing game. Collect products from the conveyor running around the left side of the shed, discard unwanted items in the compost bin at the conveyor exit, place the order into one of two packing boxes on the right, and carry a correctly sealed box to the truck. Uncollected produce travels into the compost bin and disappears. Incorrect boxes are visibly damaged and are cleared when the driver leaves.

Balancing is centralized in `config.js`. `game.js` separates state, controls, orders, interactions, validation, scoring, vehicle transitions, persistence, and canvas rendering.

Desktop controls use arrows/WASD. Mobile provides an equivalent touch D-pad. Pickup, packing, discarding, box collection, and delivery are automatic.

Gameplay emits `orderrush:sound` events for future audio integration.
