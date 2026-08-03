# Farm Coin rewards

Farm Coins are a browser-local platform currency shared by all Farm League games and My Farm. No account or backend is required.

## Round rewards

Only a valid score-session summary can earn coins. A session can be rewarded once.

- Reach 30 seconds: 2 coins
- Reach 60 seconds: 2 additional coins
- Complete the configured two-minute round: 2 additional coins
- First eligible run in each game: 3 additional coins
- Beat a non-zero previous personal best: 3 additional coins

Runs shorter than 30 seconds earn no coins. Losing never removes coins. The first recorded score uses the first-run bonus and does not also receive the personal-best bonus.

## Storage

`assets/shared/farm-coins.js` owns the versioned `farmLeague.coins.v1` localStorage record. It stores the balance, first-run flags, recently rewarded session IDs and a capped transaction ledger. On first use it migrates the balance from `farmLeague.myFarm.v2` when available, otherwise it starts at 250.

The session-ID history prevents the normal results flow or a page refresh from paying the same round twice. This is client-side convenience protection, not cheat prevention: players can still edit JavaScript or localStorage. A future backend must issue round IDs, verify score events and own the authoritative wallet balance.
