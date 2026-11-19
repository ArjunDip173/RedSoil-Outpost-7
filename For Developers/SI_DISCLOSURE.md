# How we used Super Intelligence (SI)

Red Soil: Outpost 7 was made by team **SideLoaders** (Arjun Dip Shrestha, Hardik Lamichhane, Aatish Karki and Sunny Kumar
Gupta) for the 2026 NASA Space Apps Challenge. We used SI tools while building it, and
this page explains where and how, as the Space Apps rules ask.

## In short

- **Ours:** the idea, the game design, the six missions and their story, the lessons, and the original pixel-art
  sprites.
- **Claude (by Anthropic)**, used as a coding assistant through Claude Code: rewriting the game as an HTML5 web game,
  combining, modifying and enhancing our sprites, building LUNA's AI chat and voice, debugging, and adding features.
- **AI audio tools:** most of the sound effects and the music were generated with AI.
- **Google Gemini**, used inside the game: it writes LUNA's chat answers live while you play.

## Where SI helped

| Part of the project       | What we did                                                                                            | What SI did                                                                                                                                                                                                                                                                                                                               |
| ------------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Idea and game design      | Came up with the idea, the setting, the missions, what each one teaches, and how the base should work. | Nothing. SI was not used to come up with the idea.                                                                                                                                                                                                                                                                                        |
| First version of the game | Built the first version ourselves.                                                                     | When we kept hitting the same bugs, Claude suggested rewriting the game as an HTML5 / TypeScript web game that runs from a single file, and helped us write that version.                                                                                                                                                                 |
| Sprites and art           | Drew the original sprites (astronaut, LUNA, rover, base, rocks, icons, mission patches).               | The sprites were later modified and enhanced with SI. Claude also combined them into sprite sheets, set up recolouring so the astronaut matches the player's chosen suit, skin and hair, and wrote code that draws extra art: the foldable solar panels, the guide path, particles and lighting, the confetti and the certificate layout. |
| Sound effects and music   | Chose which sounds the game needs and when they play.                                                  | Most of the sound effects and the music tracks were generated with AI audio tools.                                                                                                                                                                                                                                                        |
| LUNA, the AI helper       | Decided what LUNA should be: a kind, safe helper for kids that only talks about space and the game.    | Claude helped build the chat window, the safety instructions, the offline answers from the Science Log, and the small server that connects to Google Gemini. During play, Gemini writes the chat answers.                                                                                                                                 |
| LUNA's voice              | Wanted LUNA to read instructions aloud for young readers.                                              | Claude helped use the browser's built-in text-to-speech. The browser speaks the text live; no voice recordings were made.                                                                                                                                                                                                                 |
| Debugging and features    | Tested the game, reported problems and chose what to add.                                              | Claude helped find and fix bugs and add features, including touch controls for phones and tablets, the glowing guide path, dust storms with foldable solar panels, faster AI answers, the larger minimap and the certificate confetti.                                                                                                    |
| Documents                 | Decided what to say about the project.                                                                 | Claude helped draft the README and these submission documents, which we reviewed.                                                                                                                                                                                                                                                         |

## How SI is marked in the project

- **Visible watermark on the art:** while playing, a small "SI-assisted art & audio" label sits under the minimap.
  The title screen and the printable certificate carry the same note, and so does our demo video.
- **Sprite files:** each sprite sheet (`src/assets/sprites/*.png`) has a `Description` note in its PNG metadata
  saying the art was drawn by SideLoaders and modified and enhanced with SI.
- **Sound files:** each sound (`src/assets/audio/`) has a comment in its own file metadata (the WAV INFO comment or
  the MP3 ID3 comment) saying it was generated with AI. The same is listed in
  [src/assets/audio/SOURCES.md](../src/assets/audio/SOURCES.md).
- **Code:** this page, the README section "Made with help from SI", the in-game Credits, and the web page's metadata
  (`<meta name="si-assistance">` in `index.html`). Commits written with Claude's help carry a `Co-Authored-By: Claude`
  line in the Git history.
- **LUNA's chat:** every answer written by Gemini is labelled "AI answer · check big facts with a grown-up". Offline
  answers are labelled "From LUNA's Science Log".
- **NASA branding:** no NASA logos, flags or mission identifiers were generated or changed. The mission patches are our
  own designs.

## Facts and safety

The science facts in the game come from NASA and Canadian Space Agency sources and are listed in the in-game Science
Log and in the README's [Science sources](../README.md#science-sources). LUNA's AI answers are told to stay on space and the game, to keep answers
short and kind, and never to ask for personal information. The server also turns on Google's safety filters and limits
how many questions each player can ask.
