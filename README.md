# Red Soil: Outpost 7

A top-down pixel-art game where kids aged 7–12 train as junior astronauts on Mars: they keep a small base alive by managing power, water, air, food and radiation, then fix the radio and call Earth.

Developed by **SideLoaders** for the **2026 NASA Space Apps Challenge**: _Build a Junior Astronaut Mission Trainer_.

## Play

Double-click **`RedSoil-Outpost7.html`**. It opens in any modern browser and contains the whole game (code, art, sound and mission data), so it also works offline. Only LUNA's AI answers need the internet; without it she answers from the game's built-in Science Log.

Online, the same file is served by GitHub Pages (see [Put it on GitHub](#put-it-on-github)). Players need no key or setup: LUNA's AI works in both.

## How to play

| Key                      | What it does                                         |
| ------------------------ | ---------------------------------------------------- |
| W A S D / arrows         | Walk (or drive the rover)                            |
| E                        | Use the thing you are next to                        |
| Mouse (hold)             | Use your tool: brush, dig, build                     |
| 1–4 / click the tool bar | Pick a tool (tools appear as the missions need them) |
| Esc                      | Menu                                                 |

Big buttons in the bottom-right do everything else: **Watch** (Tab) for all your stats, **Ask LUNA** (T), **Map** (M), **Scan** (Q, outside), **Base Ops** (B, inside), **Go Home** (R, in the rover) and **Fast** (hold inside the base to speed up time).

**On a phone or tablet** the touch controls appear by themselves (hold a phone sideways):

| Touch                  | What it does                                                                                              |
| ---------------------- | --------------------------------------------------------------------------------------------------------- |
| Thumb on the left side | A joystick appears under it: drag to walk or drive (a small push walks slowly)                            |
| Touch and hold a spot  | Use your tool there: brush, dig, build                                                                    |
| **E · USE** button     | Use the thing you are next to; it lights up and says what it will do (the yellow label can be tapped too) |
| **RUN** (hold)         | Sprint                                                                                                    |
| Tap the tool bar       | Pick a tool                                                                                               |

The game's instructions switch to touch words too ("tap USE" instead of "press E"). Clicking with a mouse switches back to keyboard and mouse.

## The six training missions

| Mission                    | What happens                                               | What it teaches                                       |
| -------------------------- | ---------------------------------------------------------- | ----------------------------------------------------- |
| 1. First Steps on Red Soil | Airlock safety checklist, brush dust off the solar panels  | Spacewalk safety; dust blocks sunlight                |
| 2. Power to the Outpost    | Rewire the power unit, switch on the greenhouse lights     | Every machine needs power; the Sun only gives so much |
| 3. Ice, Ice, Mars-y        | Scan for buried ice, dig it up, melt it                    | Mars has water, frozen underground                    |
| 4. Split It or Sip It?     | Plant seeds, share water between oxygen and plants         | Water can become air (electrolysis) or food           |
| 5. Solar Storm Shelter     | Build a brick shield wall, hide from a solar flare         | Space radiation and how rock and water block it       |
| 6. Call Home               | Drive the rover, find antenna parts, aim the dish at Earth | Radio signals take minutes to cross to Earth          |

After Mission 6 the player graduates and gets a printable certificate signed by SideLoaders, and Mission Control keeps sending bonus jobs.

## Made for young players

- Short, simple instructions; LUNA reads them aloud (browser speech, can be turned off) and only talks when it matters.
- Big pixel text with a text-size setting, a hologram watch instead of a busy top bar, one message at a time.
- Auto power: kids just switch machines on or off. Older players can turn on Expert power in Settings.
- Always know where to go: a glowing path of dots on the ground leads to the next mission step, walking around walls and rocks. An arrow next to the astronaut points the way, the goal gets a bouncing beacon with its name, an arrow at the screen edge shows where it is and how far ("ANTENNA · 89m"), and the route shows on the minimap.
- Flashing warnings for low battery, air, water and food, radiation and solar flares, plus a "time to head back" warning; the path then turns red and leads home.
- Dust storms are forecast 40 seconds ahead: fold the solar panels (Base Ops → Power, or next to a panel) or the wind cracks them. Folded panels are safe but make no power, so open them again afterwards.
- The rocket trip to Mars plays in full at the start of every new game, so every astronaut sees how they got there.
- No long waits during training (nights are skipped, crops grow faster, and the Fast button speeds up time).
- If something goes wrong, the med-evac screen explains what happened and what to try next.

## Ask LUNA (AI)

Questions go to a small server in `server/`, a **Cloudflare Worker** on the free plan. It keeps the Google key private and asks **Gemini** (Google AI Studio's free tier) for a short answer. The key never goes into the game, so the game can be shared publicly.

- The game sends LUNA's instructions, the current mission step and a few matching NASA facts with each question. The player's name is never sent.
- The server adds its own rules (only space and game topics, kind answers, no personal information), turns on Google's safety filters and limits how many questions each player can ask per minute and per day.
- Answers take about 1–1.5 seconds. The free tier allows only about 20 questions per model per day, so the server tries a list of Gemini Flash models, fastest first (`MODELS` in `server/wrangler.toml`), and moves down the list as each one runs out. A small free Cloudflare KV store remembers which models are used up until when, so no copy of the server wastes time on them; if a model is slow, the next one is asked too and the first answer wins.
- The key has no billing attached, so the server can never cost money. If the free limit runs out, or the server can't be reached, LUNA answers offline from the Science Log and handles simple chit-chat.

**Set up or update the server (one command, once):**

```bash
bash server/deploy.sh
```

It asks for a free Google AI Studio key (make one at https://aistudio.google.com/apikey; it is saved privately in `server/.env`), opens the Cloudflare sign-in page (a free account, no credit card), deploys the server, asks LUNA a test question, then writes the server's address into `src/config.ts` and rebuilds `RedSoil-Outpost7.html`. To change the key later, run `bash server/set-key.sh`, then `bash server/deploy.sh` again.

For a local alternative, `litellm/` contains a LiteLLM proxy setup that the game can use too (Settings → Advanced).

## Put it on GitHub

1. Run `bash server/deploy.sh` first, so `RedSoil-Outpost7.html` points at your AI server.
2. Create an empty repository on github.com, then from this folder:
   ```bash
   git init -b main
   git add .
   git commit -m "Red Soil: Outpost 7"
   git remote add origin https://github.com/<your-name>/<repo>.git
   git push -u origin main
   ```
   `.gitignore` keeps `server/.env` (your key), `node_modules/` and build folders out of the repository.
3. On GitHub: **Settings → Pages → Build and deployment → Deploy from a branch → `main` / `(root)`**. After a minute the game is live at `https://<your-name>.github.io/<repo>/` (the page opens `RedSoil-Outpost7.html` by itself).

## Made with help from SI

Team SideLoaders: Arjun Dip Shrestha, Hardik Lamichhane, Aatish Karki and Sunny Kumar Gupta.

The idea, missions and story are ours, and we drew the original pixel art, which was later modified and enhanced with
SI. Most of the sound effects and the music were generated with AI audio tools. We used Claude (by Anthropic) as a
coding assistant: it suggested rewriting our first version as this HTML5 game and helped write it, combined our
sprites into sprite sheets, helped build LUNA's AI chat and voice, and helped us debug and add features. LUNA's chat
answers are written live by Google Gemini and are labelled "AI answer" in the game. The art and audio are marked with
a visible "SI-assisted art & audio" watermark in the game and with notes in each file's metadata. Details:
[For Developers/SI_DISCLOSURE.md](For%20Developers/SI_DISCLOSURE.md).

## Project structure

```
src/
  main.ts           start-up, screens (loading → menu → intro → game) and the frame loop
  Game.ts           one play session: world, entities, systems, update and draw order
  config.ts         all tunable numbers (power, oxygen, radiation, crops, tools, recipes)
  types.ts          shared types
  core/             sprite sheets, audio, input, saving, read-aloud voice, canvas helpers
  world/            the tile map, the habitat and objects in the world
  entities/         the player, the rover and LUNA
  systems/          missions, resources, weather and radiation, lighting, particles, AI chat
  ui/               HUD, windows, menus and the intro cutscene
  assets/sprites/   sprite sheets (PNG) with frame positions (JSON)
  assets/audio/     sound effects (WAV) and music (MP3)
public/resources/data/   missions.json and nasa_facts.json (all mission text and facts)
server/             LUNA's AI server (a Cloudflare Worker) and its deploy script
litellm/            optional local AI proxy
tests/              automated checks (Vitest)
For Developers/     SI_DISCLOSURE.md: how we used SI (our other team notes stay off GitHub)
scripts/package.sh  builds a clean submission zip
scripts/mark-si-assets.py  writes the SI note into the sprite and sound files' metadata
```

Mission text and facts live in JSON, so teachers can edit missions without touching code. Characters are drawn once in neutral marker colours and recoloured at load time to match the player's chosen suit, skin and hair colours.

## Development

```bash
npm install
npm run dev       # play at http://localhost:5173 while editing
npm test          # data and logic checks
npm run build     # type-check, then rebuild RedSoil-Outpost7.html
npm run format    # format the code with Prettier (CI checks this)
npm run package   # build + clean zip in release/ (no keys, no node_modules)
```

Built with TypeScript, Vite and the HTML5 Canvas. The build inlines everything into one HTML file so it can be submitted and opened without a server. Every push runs the type-check, the tests and a formatting check on GitHub Actions (`.github/workflows/ci.yml`).

Remember to run `npm run build` before committing gameplay changes, so `RedSoil-Outpost7.html` (the file people play) is up to date.

## Science sources

NASA DONKI (space weather alerts), Curiosity's RAD instrument and ISS dosimetry (radiation), NASA OSDR (space biology and plant growth), the Canadian Space Agency (Canadarm2, Phoenix's weather station, Curiosity's APXS) and NASA's Mars missions (Phoenix, Spirit, Opportunity, Curiosity, Perseverance, InSight, MAVEN, Ingenuity). Gameplay numbers are simplified for learning. This is a hackathon project, not an official NASA product.
