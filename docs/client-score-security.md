# Client-side score security audit

Date: 2026-07-28

## Scope and approach

Farm League remains a static, entirely client-side website. This change improves score consistency, rejects malformed results, and records enough round context for later investigation. It does not make browser scores authoritative.

Every game now creates one `FarmLeagueScore` round session. Score-producing code can only request positive, finite, safe-integer awards through `award()`. The recorder owns the total, aggregates named actions, assigns a unique session ID, records start/completion timestamps and game version, validates elapsed time and the final total, and stores the latest summary in `localStorage`. Timer-success outcomes must also consume approximately two minutes of game and wall time. Invalid summaries never replace a local best score.

The maximums below are conservative validation ceilings, not gameplay score caps or expected player scores.

| Game | Conservative two-minute maximum | Basis |
| --- | ---: | --- |
| Tractor Dash | 13,000 | At 5× speed the tractor travels at 825 px/s. Its scoring footprint can sweep at most roughly 75 new 28 px tiles/s. Allowing field transitions, progressively larger field-clear bonuses, and favourable obstacle layouts produces a ceiling below 13,000. |
| Feed Run | 12,000 | Uses 245 px/s movement, phase minimum spawn distances, pickup radius, shortest possible pen entry, the maximum 29-point delivery, pre-spawned food, and the 50-point completion award. This is deliberately much higher than a realistic run because food placement is random. |
| Order Rush | 8,000 | A new scoring order cannot begin faster than the 0.8 s truck transition. At most 150 orders could therefore exist in 120 seconds, even assuming impossible zero-time packing. The maximum order value is 53 points: `150 × 53 = 7,950`. |
| Fence Frenzy | 20,000 | Uses the nine-second seed-to-ready minimum, the maximum 90-tile field, 15 points per harvest including collected coins, all configured rabbit/crow spawns, repairs, and the 90-point final field size. It intentionally overestimates simultaneous harvesting. |

## Tractor Dash audit

- **Score:** `scoreSession`, `currentScore()`, `awardScore()`, `saveBestScore()`, `mow()`, `completeField()`, and `end()`. `mown`, `level`, `fieldsCleared`, `field.totalTiles`, `CONFIG.fieldClearBonus`, and each newly cut tile determine awards.
- **Timer/completion:** `running`, `last`, `timeLeft`, `elapsed`, `transition`, `raf`, `start()`, `end()`, `loop()`, `completeField()`, and `formatTime()`.
- **Movement/speed:** `tractor.x/y/dx/dy/base/mult/crashTimer/crashCooldown`, `speedPoints`, `CONFIG.tractor`, `resolveDir()`, and `move()`.
- **Collisions:** `coll()`, `tileBlocked()`, `nearbyObstacles()`, `move()`, and `updateAnimals()`. Obstacles reset speed; touching a cow or sheep ends the round.
- **Field generation:** `runSeed`, `field`, `level`, `obstacles`, `mown`, `fieldProfile()`, `generateObstacles()`, `countMowableTiles()`, `buildField()`, `mow()`, and `completeField()`.
- **Enemy behaviour:** `animals`, `spawnClock`, `spawnAnimal()`, `updateAnimals()`, and `updateSpawns()`.
- **Not applicable:** hunger and crop-growth systems.

Score events are `grass-mown` and `field-clear`.

## Feed Run audit

- **Score:** `scoreSession`, `currentScore()`, `awardScore()`, `saveBestScore()`, `state.combo`, `deliverFood()`, and `finishRound()`. Food base score, critical hunger, combo step/cap, and completion bonus come from `CONFIG`.
- **Timer/completion:** `state.running/timeLeft/elapsed`, `lastFrame`, `animationFrame`, `startRound()`, `update()`, `finishRound()`, and `gameLoop()`.
- **Movement/speed:** `state.player`, `CONFIG.player`, `movementVector()`, and `updatePlayer()`.
- **Collisions:** `pointInsideRect()`, `playerTouchesPenFence()`, `canPlayerOccupy()`, `updateFood()`, and `updateDeliveries()`.
- **Hunger:** `state.animals`, `CONFIG.hunger`, `CONFIG.difficultyPhases`, `currentPhase()`, `updateHunger()`, and `deliverFood()`.
- **Food behaviour:** `state.foods/carriedFood/spawnHistory/spawnsSinceHay`, `chooseTargetAnimal()`, `chooseFoodType()`, `findFoodPosition()`, `spawnFood()`, `maintainFoodSupply()`, `guaranteeCriticalFood()`, and `updateFood()`.
- **Decorative animals:** `state.penAnimals`, `ANIMAL_DEFINITIONS.speed`, and `updatePenAnimals()` affect presentation but not scoring or collision.
- **Not applicable:** crop growth and hostile enemies.

Score events are `food-delivered` and `round-completed`.

## Order Rush audit

- **Score:** `scoreSession`, `currentScore()`, `awardScore()`, `saveBest()`, `state.completed/streak/bestStreak`, `deliverBox()`, and `finish()`. `CONFIG.scoring`, order units, remaining deadline percentage, and streak determine each award. `miss()` does not deduct points.
- **Timer/completion:** `state.running/elapsed/timeLeft/orderTime/orderDeadline`, `state.vehicle.elapsed`, `last`, `raf`, `startRound()`, `updateTransition()`, `update()`, `finish()`, and `loop()`.
- **Movement/speed:** `state.player`, `CONFIG.player`, the keyboard/D-pad state, and `move()`.
- **Collisions/interactions:** `dist()`, `inside()`, `handleAutomaticInteractions()`, conveyor food pickup, box pickup/packing, compost discard, and truck delivery.
- **Order/food behaviour:** `state.order/boxes/foods/carryFood/carryBox/vehicle`, `phase()`, `makeOrder()`, `spawnFood()`, `maintainFood()`, `updateConveyor()`, `validateBox()`, `beginTransition()`, `deliverBox()`, and `miss()`.
- **Not applicable:** hunger, crop growth, and hostile enemies.

The only score event is `order-delivered`.

## Fence Frenzy audit

- **Score:** `scoreSession`, `awardScore()`, `scoreBreakdown()`, `saveBest()`, `state.harvests/coinsCollected/rabbitsScared/crowsScared/fencesRepaired`, `harvestNearbyCrop()`, `sendThreatAway()`, `updateRepair()`, `maybeExpandField()`, and `finishRound()`.
- **Timer/completion:** `state.running/elapsed/timeLeft`, `lastFrame`, `animationFrame`, `startRound()`, `update()`, `finishRound()`, and `gameLoop()`.
- **Movement/speed:** `state.player`, `CONFIG.player`, `movementVector()`, and `updatePlayer()`.
- **Collisions:** `distance()`, `pointInRect()`, `pointSegmentDistance()`, `playerHitsFence()`, `updateRepair()`, `updateStations()`, `harvestNearbyCrop()`, and `scareThreatsNearPlayer()`.
- **Crop growth:** `state.field/crops/harvests/expansionCooldown/expansionPulse`, `cropStages`, `CONFIG.crops`, `fieldForLevel()`, `createCrop()`, `createCrops()`, `stageDuration()`, `advanceCrop()`, `updateCrops()`, `harvestNearbyCrop()`, `healthyCropRatio()`, and `maybeExpandField()`.
- **Rabbit behaviour:** `state.rabbits/spawnClock`, `CONFIG.rabbits`, `spawnRabbit()`, `chooseFence()`, `updateRabbit()`, and `updateRabbits()`.
- **Crow behaviour:** `state.crows/nextCrowSpawnAt`, `CONFIG.crows`, `spawnCrow()`, `updateCrow()`, and `updateCrows()`.
- **Dog behaviour:** `state.dogs/pendingDog/dogPurchases`, `CONFIG.dogs`, `dogTargets()`, `updateDogs()`, `buyDog()`, and `placePendingDog()`.
- **Fence/economy behaviour:** `state.fences/fenceLevel/repair/coins`, `CONFIG.fences`, `createFences()`, `fenceMaximumHealth()`, `updateRepair()`, `buyFenceUpgrade()`, and `updateStations()`.
- **Not applicable:** hunger.

Score events are `crop-harvested`, `coin-collected`, `rabbit-scared`, `crow-scared`, `fence-repaired`, and `field-tile`.

## Cheats that remain possible

A player who controls the browser can still:

- edit JavaScript or configuration before it executes;
- replace `FarmLeagueScore`, intercept its methods, or forge a stored summary;
- change movement speed, collision results, timers, hunger drain, spawn positions, crop ages, enemy states, or random-number results;
- invoke internal gameplay functions through breakpoints or modified source;
- edit or delete `localStorage`;
- replay or fabricate a complete round payload.

Session IDs and timestamps generated by the browser are useful identifiers, but they are not proof. Obfuscation, checksums, signatures with a browser-held secret, and client-only hashes would not change that trust boundary.

## Future backend verification data

The optional Supabase `submit-score` function now provides a first server boundary for authenticated private scores. It checks the user JWT, game/version allow-list, configured score ceiling, elapsed time, timestamps, event-point total and duplicate session IDs. These checks reject malformed and obviously impossible submissions, but all underlying gameplay events are still reported by the client and can therefore be forged.

A backend should issue a short-lived, single-use round token containing the authenticated player ID, game ID, approved game/scoring version, server start time, duration, and a server nonce. At completion it should receive:

- the token and client session ID;
- score-event counts and points by type;
- event timestamps or a compact ordered event stream;
- final score, outcome, elapsed time, and completion time;
- game-specific facts:
  - Tractor Dash: seed, tile coordinates/order, field levels, collisions;
  - Feed Run: food IDs/types, pickup and delivery times, destination animal, hunger before/after;
  - Order Rush: server-derived order requirements, packed contents, delivery and deadline times;
  - Fence Frenzy: crop IDs/stages, harvests, coin purchases, pest spawn/scare events, repairs, and field expansions.

The server must recompute the score from an allow-listed version of the rules, reject reused/expired tokens, enforce event ordering and plausible timing, and store authoritative leaderboard results separately from client-local best scores.
