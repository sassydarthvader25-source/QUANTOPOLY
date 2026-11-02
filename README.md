# Quantopoly: online multiplayer

    npm install && npm start      # http://localhost:3000
    npm test                      # quantum maths, rules, 40-game random-play fuzz (with joins and leaves)

## Put it online (Render, free)
1. Make a free account at github.com. Click New repository, name it `quantopoly`, then "uploading an existing file" and drag in everything from this folder (not `node_modules`). Commit.
2. Make a free account at render.com. New > Web Service > connect your GitHub > pick `quantopoly`.
3. Settings: Runtime Node, Build Command `npm install`, Start Command `npm start`, Instance type Free. (A `render.yaml` is included, so "New > Blueprint" fills these in for you.)
4. Deploy. You get a link like `https://quantopoly.onrender.com`. Open it, create a room, copy the invite link.
Notes: the free tier sleeps after about 15 minutes with nobody connected (first visit then takes about a minute), and games live in memory, so a restart or redeploy ends any running game.

## Look
Crimson, cream, indigo and teal, from the title slide. Fonts (Lilita One, Barlow Semi Condensed, STIX Two Text; all SIL OFL) are bundled in public/fonts, so it works offline.

## Files
- game/board.js    CONFIG (every number to tweak), GATES, the 40 tiles
- game/cards.js    chance (trivia) and community chest decks (server only)
- game/quantum.js  exact simulator for 0/1/+/- and H, X, Z, CNOT, CZ (shared with the browser for previews)
- game/engine.js   rules: one handler per action; server-authoritative; add/remove players
- server.js        rooms, reconnect tokens, join/leave, broadcasting
- public/          interface (index.html, style.css, app.js, fonts)

## Rules as implemented (Quantopoly rulebook)
- Start: $1000 and 3 random state cards (0, 1, +, -). Passing Go: $200 and 2 new cards.
- Gates are single-use tokens bought on gate tiles (H, X, Z, CNOT, CZ). On an owned shop the price goes to the owner.
- Play a token on your cards during your turn. No limit per turn (`gatesPerTurn` in game/board.js).
- Entangle with CNOT or CZ on two cards. The control must be + or -. CNOT wants the target 0 or 1, CZ wants the target + or -.
  H flips a card between the two families, so most pairs need 0 to 2 H tokens (table in the in-game guide).
  Both cards are used up and an entangled state is banked.
- State shops (tiles 13 and 38): a random state card for $40, or the exact card you choose for $80.
- Round 1 is for visiting: everyone can buy tokens at any shop, nobody can own one yet.
- Own a shop from round 2: 4 entangled states for the first, 8 for the second, and so on, plus $300. States are kept and still score.
- Chance: quantum trivia (correct earns $50 easy, $150 hard; wrong costs nothing).
- Community chest: money events, fun facts, and decoherence cards (your + and - cards collapse to 0 or 1).
- Lab fees tile: pay $100. Open market (tile 23): buy 1 of 3 random gate tokens, or recycle a card for $50.
- Jail: leave with doubles (3 tries) or pay $50. It holds you but does not change your cards.
- Rooms stay open: people can join mid-game (same start as everyone, end of turn order) and can leave at any time
  (their cards go, their shops return to the bank, the host role passes on).
- Winning: most entangled states, cash breaks ties. The host can set "first to N" in the lobby, or end the game at any time.

## Not built yet
CY and any gate that needs i phases, BB84 questions, power-up cards, reverse gates, auto-skipping a disconnected player,
shielding from decoherence, custom board art.
