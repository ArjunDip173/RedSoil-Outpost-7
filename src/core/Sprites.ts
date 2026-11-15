/**
 * Loads the sprite sheets from src/assets/sprites and cuts them into one canvas per sprite.
 *
 *  sprites.png     tiles, objects, machines, icons, UI frames, intro art
 *  characters.png  astronaut, rover and flag drawn with marker colours
 *                  (magenta = suit, green = skin, blue = hair), recoloured for each player
 *  roof.png        the habitat roof seen from above
 *
 * Frame rectangles live in the matching .json files ([x, y, w, h] per sprite name).
 */
import charactersJson from '../assets/sprites/characters.json';
import charactersPng from '../assets/sprites/characters.png';
import roofPng from '../assets/sprites/roof.png';
import spritesJson from '../assets/sprites/sprites.json';
import spritesPng from '../assets/sprites/sprites.png';
import type { Profile } from '../types';
import { type Ctx, hexToRgb, makeCanvas, rect, shadeRgb } from './canvas';

/** name → [x, y, w, h] on the sheet */
type Frames = Record<string, number[]>;

/** Astronaut sprite layout (Player.ts builds frame names from these). */
export const ASTRO_W = 24;
export const ASTRO_H = 24;
export type LegFrame = 'idle' | 'walkA' | 'walkB' | 'walkC' | 'jump';
export type ArmFrame = 'down' | 'fwd' | 'brush0' | 'brush1' | 'up';

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load ${src.slice(0, 60)}`));
    img.src = src;
  });
}

function cut(sheet: HTMLImageElement, frames: Frames, into: Map<string, HTMLCanvasElement>): void {
  for (const [name, [x, y, w, h]] of Object.entries(frames)) {
    const [c, g] = makeCanvas(w, h);
    g.drawImage(sheet, x, y, w, h, 0, 0, w, h);
    into.set(name, c);
  }
}

/**
 * Palette swap for the character sheet. Marker colours are pure hues, so the brightness of
 * each pixel tells us how much the artist shaded it; we apply the same shading to the
 * player's colour.
 */
function recolor(src: HTMLCanvasElement, p: Profile): HTMLCanvasElement {
  const [c, g] = makeCanvas(src.width, src.height);
  g.drawImage(src, 0, 0);
  const img = g.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  const suit = hexToRgb(p.suitColor);
  const skin = hexToRgb(p.skinTone);
  const hair = hexToRgb(p.hairColor);
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    const r = d[i];
    const gr = d[i + 1];
    const b = d[i + 2];
    let base: [number, number, number] | null = null;
    let f = 1;
    if (gr === 0 && r === b && r > 0) [base, f] = [suit, r / 255];
    else if (r === 255 && b === 255 && gr > 0 && gr < 255) [base, f] = [suit, 1 + gr / 255];
    else if (r === 0 && b === 0 && gr > 0) [base, f] = [skin, gr / 255];
    else if (gr === 255 && r === b && r > 0 && r < 255) [base, f] = [skin, 1 + r / 255];
    else if (r === 0 && gr === 0 && b > 0) [base, f] = [hair, b / 255];
    else if (b === 255 && r === gr && r > 0 && r < 255) [base, f] = [hair, 1 + r / 255];
    if (base) [d[i], d[i + 1], d[i + 2]] = shadeRgb(base, f);
  }
  g.putImageData(img, 0, 0);
  return c;
}

export class Sprites {
  readonly sprites = new Map<string, HTMLCanvasElement>();
  /** ground[groundId][variant]: 16×16 top-down tiles */
  readonly ground: HTMLCanvasElement[][] = [];
  /** objs[objectId][variant]: 16×24 blocks drawn 8 px up so they stand off the ground */
  readonly objs: HTMLCanvasElement[][] = [];
  private readonly templates = new Map<string, HTMLCanvasElement>();

  static async load(): Promise<Sprites> {
    const s = new Sprites();
    const [main, chars, roof] = await Promise.all([
      loadImage(spritesPng),
      loadImage(charactersPng),
      loadImage(roofPng),
    ]);
    cut(main, spritesJson.frames, s.sprites);
    cut(chars, charactersJson.frames, s.templates);
    const [rc, rg] = makeCanvas(roof.width, roof.height);
    rg.drawImage(roof, 0, 0);
    s.sprites.set('roof', rc);
    for (const [name, c] of s.sprites) {
      const m = /^(ground|obj)_(\d+)_(\d+)$/.exec(name);
      if (!m) continue;
      const list = m[1] === 'ground' ? s.ground : s.objs;
      (list[Number(m[2])] ??= [])[Number(m[3])] = c;
    }
    return s;
  }

  get(name: string): HTMLCanvasElement {
    const s = this.sprites.get(name);
    if (s) return s;
    // magenta square: a missing sprite is easy to spot
    const [c, g] = makeCanvas(8, 8);
    rect(g, 0, 0, 8, 8, '#ff00ff');
    this.sprites.set(name, c);
    return c;
  }

  has(name: string): boolean {
    return this.sprites.has(name);
  }

  /** Draw a sprite, optionally mirrored around its own centre. */
  draw(g: Ctx, name: string | HTMLCanvasElement, x: number, y: number, flip = false, alpha = 1): void {
    const img = typeof name === 'string' ? this.get(name) : name;
    if (alpha !== 1) g.globalAlpha = alpha;
    if (flip) {
      g.save();
      g.translate(Math.round(x) + img.width, Math.round(y));
      g.scale(-1, 1);
      g.drawImage(img, 0, 0);
      g.restore();
    } else {
      g.drawImage(img, Math.round(x), Math.round(y));
    }
    if (alpha !== 1) g.globalAlpha = 1;
  }

  /** Paint the astronaut, rover and flag in the player's colours. */
  tintProfile(profile: Profile): void {
    for (const [name, tpl] of this.templates) this.sprites.set(name, recolor(tpl, profile));
  }
}
