# PlayGround

<!-- omgithub:readme:start -->
## 🚀 Build, play, and remix with OMGithub

**Created using [OMGithub.com](https://omgithub.com).**

[![OMGithub](https://img.shields.io/badge/OMGithub-Open%20project-orange?style=for-the-badge)](https://omgithub.com/mbasal418-bit/PlayGround)
[![GitHub](https://img.shields.io/badge/GitHub-Source-181717?logo=github&style=for-the-badge)](https://github.com/mbasal418-bit/PlayGround)

- 🎮 [Open the project](https://omgithub.com/mbasal418-bit/PlayGround).
- ✨ [Remix this project](https://omgithub.com/?remix=mbasal418-bit%2FPlayGround).
- 💻 [Explore the source](https://github.com/mbasal418-bit/PlayGround).
- 🛠️ [Check build runs](https://github.com/mbasal418-bit/PlayGround/actions).
- 🐛 [Report an issue](https://github.com/mbasal418-bit/PlayGround/issues).
- 👤 [Explore the creator's projects](https://omgithub.com/mbasal418-bit).
- 🌍 [Create with OMGithub](https://omgithub.com).
<!-- omgithub:readme:end -->

## IRONSIGHT — 45° house raid

A self-contained 2D top-down tactical shooter built with Canvas 2D and ES modules. No build step, no external dependencies.

You are the operator. A procedurally generated safehouse holds armed hostiles. You can only see a **45° cone** in front of you; everything outside it is rendered through a soft blur. Clear every room before the house clears you.

### Play

Open `index.html` through any static web server:

```bash
python3 -m http.server 3002
# then open http://localhost:3002
```

**Desktop:** `WASD` / arrow keys move · mouse aims · left mouse button fires · `R` reloads · `Esc` or `P` pauses.

**Mobile:** left stick moves · right stick aims and fires · the round button reloads · the pause icon opens the pause screen. The HUD and controls adapt to portrait and landscape safe areas.

### What is in the house

- Every generated house has **6 rooms plus a central hallway**, with doors, furniture, lamps and a minimap.
- **10 hostiles** are placed across the rooms and hallway. They never move, but they track the player, telegraph their shots, and fire bursts when they have line of sight.
- Walls and tall furniture occlude both vision and bullets. The sharp area is raycast from the player; the rest of the frame is a low-resolution blur layer.
- Health, armor, magazine/reserve ammo, reload timing, hit markers, room-clear callouts, mission results and a pause screen are all included.
- Synthesized WebAudio effects are generated at runtime; audio starts after the first user gesture.

### URL options

| Query | Purpose |
| --- | --- |
| `?seed=12345` | Reproduce a specific house layout. |
| `?rs=0.6` | Force a render scale between `0.4` and `1`. |
| `?debug=1` | Disable the cone/blur compositing for inspection. |
| `?debug=house` | Draw the whole floorplan with player/enemy markers. |

Render scale adapts automatically: `0.6` on software rasterizers (SwiftShader/llvmpipe), `0.7` on large screens, and `1` on smaller displays. The debug API is available at `window.__IRONSIGHT__` for scripted checks (`state`, `house`, `view`, `teleport`, `killAll`, `clearRoom`, `damage`, `setGodMode`, and more).

### Source layout

- `index.html` — game shell, HUD, screens and touch controls.
- `styles.css` — responsive layout, HUD and screen styling.
- `src/main.js` — game loop, input, combat, camera, vision/blur compositing.
- `src/house.js` — procedural floorplan, furniture, enemy and lamp placement.
- `src/world.js` — baked world rendering, lighting, minimap and floorplan.
- `src/audio.js` — synthesized sound effects and ambience.
- `src/utils.js` — math, RNG, raycasting and collision helpers.
