import { FrameBuffer, type Rgb } from "./frame-buffer";

const sixBit = (v: number) => Math.min(252, Math.max(0, Math.round(v / 4) * 4));

/** Rounds each channel to the 6-bit levels of a VGA DAC. */
function vga(r: number, g: number, b: number): Rgb {
  return [sixBit(r), sixBit(g), sixBit(b)];
}

// Colours outside the scene palette: the interface, the sky at dusk and night, and this project's additions (birds, lamps,
// wind socks, the moon, stars, snowfall).
const RGB = {
  sky1: vga(100, 100, 242),
  sky2: vga(112, 136, 242),
  bird: vga(92, 60, 28),
  birdBody: vga(60, 40, 20),
  snow1: vga(236, 236, 244),
  post: vga(28, 24, 16),
  black: vga(0, 0, 0),
  white: vga(244, 244, 244),
  lampLight: vga(252, 248, 224),
  lampGlow: vga(252, 236, 180),
  moon: vga(236, 232, 208),
  moonShade: vga(196, 192, 172),
  star: vga(220, 224, 252),
  sockRed: vga(224, 64, 36),
  sockWhite: vga(236, 236, 240),
  flake: vga(244, 246, 252),
  flakeFar: vga(204, 208, 224),
  /** The torso has a colour of its own in the original, not one of the outfit's: light grey (palette 239). */
  torso: vga(226, 226, 252),
  /** The torso of the cup leader: the yellow the original writes computer jumpers' names in (palette 121). */
  torsoLeader: vga(232, 228, 60),
} as const;

export type ColorName = keyof typeof RGB;

/** Lighting of the scene; dusk and night are derived from the day palette, so every hill gets them without extra art. */
export type Lighting = "day" | "dusk" | "night";

/** Lighting plus weather that changes colours (fog); snowfall is drawn separately. */
export interface Look {
  lighting: Lighting;
  fog: boolean;
}

/** Far scenery (sky, hillside, forest): at night only moonlight reaches it, fog hides most of it. */
const BACKDROP: ReadonlySet<ColorName> = new Set<ColorName>(["sky1", "sky2", "bird", "birdBody"]);
/** Interface colours keep their look at any time of day and in any weather. */
const INTERFACE: ReadonlySet<ColorName> = new Set<ColorName>([
  "black",
  "white",
  "lampLight",
  "lampGlow",
  "moon",
  "moonShade",
  "star",
]);
/** Sky colours are set rather than derived (a darkened blue reads as grey). */
const SKY_OVERRIDE: Readonly<Record<Exclude<Lighting, "day">, Partial<Record<ColorName, Rgb>>>> = {
  dusk: {
    sky1: vga(72, 60, 132),
    sky2: vga(236, 140, 92),
  },
  night: {
    sky1: vga(4, 6, 24),
    sky2: vga(14, 20, 56),
  },
};
const FOG: Readonly<Record<Lighting, Rgb>> = {
  day: vga(206, 210, 220),
  dusk: vga(200, 170, 172),
  night: vga(52, 56, 76),
};
/** How far each group of colours is pulled towards the fog colour. */
const FOG_BACKDROP = 0.7;
const FOG_HILL = 0.22;

/** A colour of the far scenery or of the (lit) hill, under the given lighting. */
function shade(base: Rgb, far: boolean, lighting: Lighting): Rgb {
  if (lighting === "day") return base;
  const [r, g, b] = base;
  if (lighting === "dusk") {
    // Low sun, the same warm tint on the hill and behind it (a weaker tint on the hill drew a hard line along its
    // far edge); the far scenery a little dimmer.
    return far ? vga(r * 0.85 + 18, g * 0.7, b * 0.76) : vga(r * 0.9 + 16, g * 0.75, b * 0.78);
  }
  // Moonlit backdrop: dark and blue. Floodlit hill (slope, inrun, fences, jumper): a little dimmer and cooler.
  return far ? vga(r * 0.2 + 4, g * 0.24 + 6, b * 0.36 + 20) : vga(r * 0.8, g * 0.82, b * 0.9);
}

function fogged(c: Rgb, far: boolean, look: Look): Rgb {
  if (!look.fog) return c;
  const f = FOG[look.lighting];
  const t = far ? FOG_BACKDROP : FOG_HILL;
  return vga(c[0] + (f[0] - c[0]) * t, c[1] + (f[1] - c[1]) * t, c[2] + (f[2] - c[2]) * t);
}

function lit(name: ColorName, look: Look): Rgb {
  if (INTERFACE.has(name)) return RGB[name];
  const far = BACKDROP.has(name);
  const override = look.lighting === "day" ? undefined : SKY_OVERRIDE[look.lighting][name];
  return fogged(override ?? shade(RGB[name], far, look.lighting), far, look);
}

/** A colour of the scene under the current look: far scenery (backdrop) or the lit hill and jumper. */
export function litRgb(rgb: Rgb, far: boolean): Rgb {
  return fogged(shade(rgb, far, look.lighting), far, look);
}

/**
 * The sky at dusk and at night is set rather than derived (a darkened blue reads as grey): the colour of the sky
 * at `t` from its top (0) to the horizon (1) under the current look, or null in daylight.
 */
export function skyAt(t: number): Rgb | null {
  if (look.lighting === "day") return null;
  const top = SKY_OVERRIDE[look.lighting].sky1 ?? RGB.sky1;
  const bottom = SKY_OVERRIDE[look.lighting].sky2 ?? RGB.sky2;
  const mix = (k: 0 | 1 | 2) => top[k] + (bottom[k] - top[k]) * t;
  return fogged(vga(mix(0), mix(1), mix(2)), true, look);
}

/** Key of the current look, for caches of colours derived under it. */
export function currentLookKey(): string {
  return lookKey;
}

const DAYLIGHT: Look = { lighting: "day", fog: false };
let look: Look = DAYLIGHT;
let lookKey = "day";

/** Runs `draw` under the given lighting and fog; colours looked up inside follow them. */
export function withLook<T>(next: Look, draw: () => T): T {
  const previous = look;
  const previousKey = lookKey;
  look = next;
  lookKey = `${next.lighting}${next.fog ? "+fog" : ""}`;
  try {
    return draw();
  } finally {
    look = previous;
    lookKey = previousKey;
  }
}

const packed = new Map<string, number>();

/** Packed RGBA value of a palette entry under the current lighting and fog. */
export function color(name: ColorName): number {
  const key = `${lookKey}:${name}`;
  let v = packed.get(key);
  if (v === undefined) {
    v = FrameBuffer.pack(lit(name, look));
    packed.set(key, v);
  }
  return v;
}

/** The 12 colours of the original's outfit editor (sampled from its screen), lightest shade of each. */
export const OUTFIT_SWATCHES: readonly Rgb[] = [
  vga(48, 48, 52),
  vga(109, 109, 113),
  vga(170, 170, 44),
  vga(238, 174, 20),
  vga(165, 85, 40),
  vga(161, 32, 36),
  vga(165, 36, 93),
  vga(170, 40, 170),
  vga(89, 36, 165),
  vga(36, 36, 165),
  vga(28, 121, 125),
  vga(28, 137, 32),
];

const ramps = new Map<string, Uint32Array>();

/** Shades of an outfit colour for the jumper, far side dark to near side light, under the current look. */
export function swatchRampTable(index: number, steps: number): Uint32Array {
  const key = `${lookKey}:swatch${index}>${steps}`;
  let table = ramps.get(key);
  if (table === undefined) {
    const [r, g, b] = OUTFIT_SWATCHES[index] ?? OUTFIT_SWATCHES[0] ?? vga(0, 0, 0);
    const dark = fogged(shade(vga(r * 0.45, g * 0.45, b * 0.45), false, look.lighting), false, look);
    const light = fogged(
      shade(
        vga(Math.min(252, r * 1.15 + 12), Math.min(252, g * 1.15 + 12), Math.min(252, b * 1.15 + 12)),
        false,
        look.lighting,
      ),
      false,
      look,
    );
    table = new Uint32Array(steps + 1);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      table[i] = FrameBuffer.pack(
        vga(dark[0] + (light[0] - dark[0]) * t, dark[1] + (light[1] - dark[1]) * t, dark[2] + (light[2] - dark[2]) * t),
      );
    }
    ramps.set(key, table);
  }
  return table;
}

/** Band of a ramp table for t in 0..1 (clamped). */
export function band(table: Uint32Array, t: number): number {
  const steps = table.length - 1;
  return table[Math.round(Math.min(1, Math.max(0, t)) * steps)] ?? 0;
}
