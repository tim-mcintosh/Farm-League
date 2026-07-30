# Farm League

Farm League is a mobile-first website for fast, addictive farming mini-games. Each game is designed as a short, replayable score challenge that can run independently while sharing a consistent Farm League home and navigation experience.

Tractor Dash, Feed Run, Order Rush, and Fence Frenzy are the currently playable games.
My Farm is the first platform feature: a local, grid-based farm viewer and builder.

## Folder structure

```text
farm-league/
├── index.html                  # Farm League homepage and game catalogue
├── games/
│   ├── tractor-dash/           # Existing playable game
│   ├── feed-run/               # Two-minute resource-management game
│   ├── order-rush/             # Two-minute movement-only packing game
│   ├── fence-frenzy/           # Two-minute crop protection and upgrade game
│   └── _template/              # Starting point for a future game
├── my-farm/                    # Local 12 × 8 farm viewer and builder
├── assets/
│   ├── shared/                 # Shared site styles and future platform assets
│   ├── audio/                  # Shared audio assets
│   ├── fonts/                  # Self-hosted font files
│   └── images/                 # Shared brand and catalogue images
├── docs/                       # Architecture and product documentation
├── README.md
└── AGENTS.md                   # Repository development rules
```

Game-specific code and assets belong in that game's directory. Shared assets should be used only when more than one page or game owns the same concern.

## Run locally

The project is a static website with no build step. From the repository root, run any static file server, for example:

```sh
python3 -m http.server 8000
```

Then open `http://localhost:8000/`. Opening `index.html` directly also works in current browsers, but a local server better matches production URL behavior.

## Add a new game

1. Copy `games/_template/` to a lowercase, hyphenated directory such as `games/new-game/`.
2. Update its title, description, headings, and game-specific styles.
3. Implement the game in its local JavaScript. As complexity grows, split state, input, update, rendering, audio, and persistence into focused modules within the game directory.
4. Implement and test equivalent desktop and touch controls.
5. Keep the **Back to Farm League** link working.
6. Test on narrow mobile portrait, mobile landscape, and desktop viewports.
7. Add a non-clickable **Coming Soon** card while the game is in development, and make it clickable only when the game is ready.
8. Document game-specific mechanics and verification steps in the game's README.

## Coding standards

- Follow `AGENTS.md` for repository-wide development rules.
- Use semantic, accessible HTML and mobile-first responsive CSS.
- Keep games isolated from each other and avoid implicit JavaScript globals.
- Preserve existing mechanics unless a change is explicitly requested.
- Use relative paths so the project can be deployed at a domain root or subdirectory.
- Prefer native browser APIs and small, maintainable modules over unnecessary dependencies.
- Run JavaScript syntax checks and verify navigation and asset paths after changes.
- Route score awards through `assets/shared/score-session.js`; do not assign game totals directly.

The current client-side score integrity model, per-game audit, validation ceilings, and future backend requirements are documented in [`docs/client-score-security.md`](docs/client-score-security.md).

## Future platform direction

Farm League is expected to support user accounts, online leaderboards, daily challenges, achievements, statistics, sound settings, and potentially multiplayer. These concerns should live at the platform layer rather than inside individual game loops. Games should eventually communicate results through a small, versioned interface and remain playable when a user is signed out or a network service is unavailable.

No backend, authentication, leaderboard, challenge, achievement, analytics, settings, or multiplayer implementation is included yet.
