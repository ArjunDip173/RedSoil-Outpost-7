# Red Soil: Outpost 7 · NASA Space Apps Challenge 2026

Team **SideLoaders** · Challenge: **Build a Junior Astronaut Mission Trainer**

This file holds our answers for each field of the Space Apps project form, in the same order, so they can be pasted
in. Our use of Super Intelligence (SI) is described in full in [SI_DISCLOSURE.md](SI_DISCLOSURE.md).

---

## Project Name

Red Soil: Outpost 7

## High-Level Project Summary

Red Soil: Outpost 7 is a pixel-art Mars base game that trains children aged 7 to 12 as junior astronauts. Players
keep a small outpost alive by managing power, water, air, food and radiation across six short missions: an airlock
safety check, cleaning dusty solar panels, rewiring the power unit, digging and melting buried ice, sharing water
between oxygen and plants, sheltering from a solar flare, and repairing a radio dish to call Earth. Each mission
teaches one real idea from NASA science, built on NASA DONKI space-weather alerts, Curiosity's radiation
measurements, NASA OSDR plant research and facts from NASA's Mars missions. LUNA, a friendly helper drone, reads the
instructions aloud and answers questions in simple words. The game runs in any web browser on computers, tablets and
phones, works offline, and needs no install or account, so a teacher can share one link with a whole class.

## Link to Project Demo

_To add: a 30-second video or a slide deck of at most 7 slides (see "Demo plan" at the end of this file)._

## Link to Final Project

- Play it: https://arjundip173.github.io/RedSoil-Outpost-7/
- Source code and documents: https://github.com/ArjunDip173/RedSoil-Outpost-7

## Detailed Project Description

**What it does.** The player is a cadet sent to Outpost 7, a Mars base hit by a dust storm. After the rocket trip
from Earth, LUNA the drone guides them through six training missions. Each one is a small job a real crew would face,
followed by a short lesson card:

| Mission                    | What the player does                                       | What it teaches                                       |
| -------------------------- | ---------------------------------------------------------- | ----------------------------------------------------- |
| 1. First Steps on Red Soil | Airlock safety checklist, brush dust off the solar panels  | Spacewalk safety; dust blocks sunlight                |
| 2. Power to the Outpost    | Rewire the power unit, switch on the greenhouse lights     | Every machine needs power; the Sun only gives so much |
| 3. Ice, Ice, Mars-y        | Scan for buried ice, dig it up, melt it into water         | Mars has water, frozen underground                    |
| 4. Split It or Sip It?     | Plant seeds, share water between oxygen and plants         | Water can become air (electrolysis) or food           |
| 5. Solar Storm Shelter     | Build a shield wall, hide from a solar flare               | Space radiation, and how rock and water block it      |
| 6. Call Home               | Drive the rover, find antenna parts, aim the dish at Earth | Radio signals take 3 to 22 minutes to cross to Earth  |

After graduating, the player gets a printable Junior Astronaut certificate, and Mission Control keeps sending bonus
jobs. Between missions the base keeps running: crops grow, batteries drain at night, dust storms are forecast and the
solar panels must be folded away before they hit, meteorites land, and solar flares send everyone to the shelter.

**How it works.** The whole game is written in TypeScript on the HTML5 Canvas and built with Vite into one HTML file
that contains the code, art, sound and mission data. It can be opened by double-clicking or played from GitHub
Pages. Mission text and NASA facts live in JSON files, so a teacher can change them without touching code. Kid-friendly
helpers are built in:

- a glowing path on the ground that leads to the next goal, plus an arrow next to the astronaut and a beacon on the
  goal (the path turns red and leads home when the suit's air runs low);
- LUNA reads instructions aloud with the browser's text-to-speech, and the "Ask LUNA" chat answers questions about
  Mars and the game. Answers come from Google Gemini through our own small server (a Cloudflare Worker) that adds
  child-safety rules and rate limits. Without internet, LUNA answers from the built-in Science Log instead;
- touch controls for phones and tablets (a joystick, a USE button, touch-and-hold to use tools), big pixel text with
  a size setting, easy mode, and no long waits.

**Benefits.** Children learn by doing: they see that a dusty panel makes less power, that water can become air or
food but not both, and that a few metres of rock protect you from a solar flare. Every fact the game teaches is
traceable to a NASA or CSA source, and the in-game Science Log collects them. Because it is a single web page with no
accounts, it works in classrooms with limited internet and on shared devices.

**What we hope to achieve.** We want a child to finish the game able to explain why astronauts care about power,
water, air and radiation, and to feel that working on Mars is something they could do one day. Next we would like to
add a teacher mode with lesson sheets for each mission, more languages, and an installable version for tablets.

**Tools and languages.** TypeScript, HTML5 Canvas, CSS, Vite, Vitest (automated tests), Prettier, GitHub Actions and
GitHub Pages; the browser Web Speech API for LUNA's voice; Google Gemini (free tier) behind a Cloudflare Worker for
LUNA's chat; Claude by Anthropic as a coding assistant (see the SI section).

## Use of Super Intelligence (SI)

Yes. The game idea, the missions, the story and the original pixel art are our own. We first built the game
ourselves, but kept running into the same bugs. We then used Claude (by Anthropic) as a coding assistant. Claude
suggested rewriting the game as an HTML5/TypeScript web game and helped us write that version. It also helped us
combine our sprites into sprite sheets and recolour the astronaut, build LUNA's AI chat and text-to-speech voice, find
and fix bugs, and add features such as touch controls, the guide path and foldable solar panels. Inside the game,
LUNA's chat answers are generated live by Google Gemini and are labelled "AI answer". The full breakdown is in
[SI_DISCLOSURE.md](SI_DISCLOSURE.md), and SI help is also acknowledged in the in-game Credits, the README and the
page's metadata. No NASA logos or branding were generated or changed.

## NASA Data

The game's science is built on these NASA data and resources (each fact in the Science Log names its source):

- **NASA DONKI** (Space Weather Database Of Notifications, Knowledge, Information): the solar flare events in
  Mission 5 and later use real flare classes (M2.4 to X2.8) and DONKI-style alerts, with a warning before the
  energetic particles arrive. https://kauai.ccmc.gsfc.nasa.gov/DONKI/
- **Curiosity's Radiation Assessment Detector (RAD)** and ISS dosimetry: the surface radiation rate in the game is
  about 0.67 mSv per Sol, matching RAD's measurements, and the shelter and lava tube cut the dose the way rock and
  water do.
- **NASA Open Science Data Repository (OSDR)** and the ISS Veggie experiments: the greenhouse crops (red romaine
  lettuce, dwarf tomatoes, chile peppers) are ones astronauts have grown in space. https://osdr.nasa.gov/
- **NASA Mars mission science** (Phoenix, Spirit, Opportunity, Curiosity, Perseverance, InSight, MAVEN, Ingenuity):
  buried ice found by Phoenix, solar panel "cleaning events" from Spirit and Opportunity, the 2018 global dust storm,
  MOXIE making oxygen, Mars sunlight at about 43% of Earth's, and the 3 to 22 minute radio delay to Earth.
  https://science.nasa.gov/mars/
- **NASA Kilopower** (a small fission reactor for Mars bases), used as an upgrade in the base.

## Space Agency Partner Data and Other References

**Canadian Space Agency (CSA):** facts about Canadarm2, the weather station on NASA's Phoenix lander that saw snow
falling on Mars, the APXS instrument on Curiosity, and astronaut Jeremy Hansen on Artemis II.
https://www.asc-csa.gc.ca/

**Other resources and tools:**

- Fonts: Press Start 2P by CodeMan38 and VT323 by Peter Hull, both under the SIL Open Font License (via Fontsource).
- Libraries and tools: TypeScript, Vite, Vitest, Prettier (all open source).
- Google Gemini API (free tier) for LUNA's chat answers; Cloudflare Workers to host LUNA's small server.
- Web Speech API (built into the browser) for LUNA's voice.
- Claude by Anthropic, used as a coding assistant (see [SI_DISCLOSURE.md](SI_DISCLOSURE.md)).
- Sprites and pixel art: drawn by SideLoaders.
- Sound effects and music: _[to add: where they came from and their licences]_.

Gameplay numbers are simplified and sped up for learning. Red Soil: Outpost 7 is a hackathon project and not an
official NASA product.

---

## Demo plan

Space Apps accepts either a video of **30 seconds or less** or a slide deck of **at most 7 slides**, in English, at a
public link. The demo must not show anyone under 18, so record the screen only.

**30-second video script**

| Time | Show                                       | Say                                                                                                       |
| ---- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| 0:00 | Title screen                               | "We're SideLoaders, and this is Red Soil: Outpost 7."                                                     |
| 0:03 | Rocket landing                             | "Our challenge: build a junior astronaut mission trainer for kids aged 7 to 12."                          |
| 0:07 | Brushing a dusty panel, the glowing path   | "Kids run a Mars base through six missions: power, ice, oxygen, plants, radiation and calling Earth."     |
| 0:14 | Solar flare warning, hiding in the shelter | "Every mission uses real NASA science, like DONKI solar flare alerts and Curiosity's radiation readings." |
| 0:20 | Asking LUNA a question on a tablet         | "LUNA, our helper drone, reads aloud and answers questions."                                              |
| 0:25 | Certificate with confetti                  | "It runs in any browser, even offline. One link, and a whole class can train for Mars."                   |

**7-slide outline**

1. Title: Red Soil: Outpost 7, team SideLoaders (team members' names), challenge name.
2. The problem: Mars survival is hard to picture for kids; science should be something they do.
3. Our solution: a Mars base game with six missions (screenshot of the base).
4. What kids learn: the mission table above, one line each.
5. Made with NASA data: DONKI, Curiosity RAD, OSDR, Mars missions, CSA.
6. How it works: one web page, touch and keyboard, LUNA (voice and AI chat), offline mode.
7. What's next: teacher mode, more languages, tablet app; play link and QR code.
