# How we used Super Intelligence (SI)

Red Soil: Outpost 7 was made by team **SideLoaders** for the 2026 NASA Space Apps Challenge. We used SI tools while
building it, and this page explains where and how, as the Space Apps rules ask. The same information is summed up in
the game's **Credits** screen, in the [README](../README.md) and in the web page's metadata (`<meta name="si-assistance">`
in `index.html`).

## In short

- **Ours:** the idea, the game design, the six missions and their story, the lessons, and the original pixel-art
  sprites.
- **Claude (by Anthropic)**, used as a coding assistant through Claude Code: rewriting the game as an HTML5 web game,
  combining and preparing our sprites, building LUNA's AI chat and voice, debugging, and adding features.
- **Google Gemini**, used inside the game: it writes LUNA's chat answers live while you play.

## Where SI helped

| Part of the project       | What we did                                                                                            | What SI did                                                                                                                                                                                                                                                                                                          |
| ------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Idea and game design      | Came up with the idea, the setting, the missions, what each one teaches, and how the base should work. | Nothing. SI was not used to come up with the idea.                                                                                                                                                                                                                                                                   |
| First version of the game | Built the first version ourselves.                                                                     | When we kept hitting the same bugs, Claude suggested rewriting the game as an HTML5 / TypeScript web game that runs from a single file, and helped us write that version.                                                                                                                                            |
| Sprites and art           | Drew the sprites (astronaut, LUNA, rover, base, rocks, icons, mission patches).                        | Claude helped combine our sprites into sprite sheets with frame lists, set up recolouring so the astronaut's suit, skin and hair match the player's choice, and wrote code that draws some extra things: the foldable solar panels, the guide path, particles and lighting, the confetti and the certificate layout. |
| LUNA, the AI helper       | Decided what LUNA should be: a kind, safe helper for kids that only talks about space and the game.    | Claude helped build the chat window, the safety instructions, the offline answers from the Science Log, and the small server that connects to Google Gemini. During play, Gemini writes the chat answers.                                                                                                            |
| LUNA's voice              | Wanted LUNA to read instructions aloud for young readers.                                              | Claude helped use the browser's built-in text-to-speech. No voice recordings were generated; the browser speaks the text live.                                                                                                                                                                                       |
| Debugging and features    | Tested the game, reported problems and chose what to add.                                              | Claude helped find and fix bugs and add features, including touch controls for phones and tablets, the glowing guide path, dust storms with foldable solar panels, faster AI answers, the larger minimap and the certificate confetti.                                                                               |
| Documents                 | Decided what to say about the project.                                                                 | Claude helped draft the README and these submission documents, which we reviewed.                                                                                                                                                                                                                                    |

## How SI is marked in the project

- **Code:** this page, the README section "Made with help from SI" and the in-game Credits. Commits written with
  Claude's help carry a `Co-Authored-By: Claude` line in the Git history.
- **LUNA's chat:** every answer written by Gemini is labelled "AI answer · check big facts with a grown-up". Offline
  answers are labelled "From LUNA's Science Log".
- **Images:** no image generator was used. The sprites are hand-drawn; the art drawn by code is listed above.
- **Audio:** LUNA's voice is the browser's own text-to-speech. Sound effects and music: _[to add: where they came
  from]_.
- **NASA branding:** no NASA logos, flags or mission identifiers were generated or changed. The mission patches are our
  own designs.

## Facts and safety

The science facts in the game come from NASA and Canadian Space Agency sources and are listed in the in-game Science
Log and in [SUBMISSION.md](SUBMISSION.md). LUNA's AI answers are told to stay on space and the game, to keep answers
short and kind, and never to ask for personal information. The server also turns on Google's safety filters and limits
how many questions each player can ask.
