import type { Transport, LightSetting } from "./types"
import { frame, pages, readPages, vendorSleep } from "./frame"

export const LIGHT_EFFECTS = [
  "LightOff",
  "LightAlwaysOn",
  "LightBreath",
  "LightNeon",
  "LightWave",
  "LightRipple",
  "LightRaindrop",
  "LightSnake",
  "LightPressAction",
  "LightConverage",
  "LightSineWave",
  "LightKaleidoscope",
  "LightLineWave",
  "LightUserPicture",
  "LightLaser",
  "LightCircleWave",
  "LightDazzing",
  "LightRainDown",
  "LightMeteor",
  "LightPressActionOff",
  "LightMusicFollow3",
  "LightScreenColor",
  "LightMusicFollow2",
  "LightTrain",
  "LightFireWorks",
  "LightUserColor",
]

const CMD_GET_LEDPARAM = 0x87
const CMD_SET_LEDPARAM = 0x07
const CMD_GET_SLEDPARAM = 0x88
const CMD_SET_SLEDPARAM = 0x08
const CMD_GET_USERPIC = 0x8c
const CMD_SET_USERPIC = 0x0c
const MAXSPEED = 4
const WHITE: [number, number, number] = [255, 255, 255]
const WHITE_WIRE: [number, number, number] = [250, 255, 250] // vendor sends pure white as 0xFAFFFA

const toWire = (rgb: [number, number, number]): [number, number, number] =>
  rgb[0] === 255 && rgb[1] === 255 && rgb[2] === 255 ? WHITE_WIRE : rgb
const fromWire = (r: number, g: number, b: number): [number, number, number] =>
  r === 250 && g === 255 && b === 250 ? WHITE : [r, g, b]

const EFFECT_USER_PICTURE = 13
const EFFECT_MUSIC_FOLLOW3 = 20
const EFFECT_SCREEN_COLOUR = 21
const EFFECT_MUSIC_FOLLOW2 = 22

/** Byte 4 = (option << 4) | colour, except for the three effects setLightSetting rewrites: the per-key
 * picture wants a 0 colour nibble (a 7/8 there makes the firmware paint a single colour over it), the
 * music effects encode dazzle as 0 vs 4, and screen-colour zeroes the whole byte. */
function lightByte4(s: LightSetting): number {
  if (s.effect === EFFECT_SCREEN_COLOUR) return 0
  if (s.effect === EFFECT_USER_PICTURE) return s.option << 4
  if (s.effect === EFFECT_MUSIC_FOLLOW2 || s.effect === EFFECT_MUSIC_FOLLOW3)
    return (s.option << 4) | (s.colour === 8 ? 0 : 4)
  return (s.option << 4) | s.colour
}

export async function writeLight(t: Transport, s: LightSetting): Promise<void> {
  // ponytail: the vendor also pins the per-key-picture rgb to its own (0,200,200) marker — mirrored.
  const [r, g, b] = s.effect === EFFECT_USER_PICTURE ? [0, 200, 200] : toWire(s.rgb)
  const buf = [CMD_SET_LEDPARAM, s.effect, MAXSPEED - s.speed, s.brightness, lightByte4(s), r, g, b]
  await t.send(frame(buf, "bit8"))
  await vendorSleep()
}

export async function readLight(t: Transport): Promise<LightSetting> {
  const resp = await t.request(frame([CMD_GET_LEDPARAM]))
  return {
    effect: resp[1],
    speed: MAXSPEED - resp[2],
    brightness: resp[3],
    option: resp[4] >> 4,
    colour: resp[4] & 0xf,
    rgb: fromWire(resp[5], resp[6], resp[7]),
  }
}

export async function writeSideLight(t: Transport, s: LightSetting): Promise<void> {
  const [r, g, b] = toWire(s.rgb)
  const buf = [CMD_SET_SLEDPARAM, s.effect, s.speed, s.brightness, (s.option << 4) | s.colour, r, g, b]
  await t.send(frame(buf, "bit8"))
  await vendorSleep()
}

export async function readSideLight(t: Transport): Promise<LightSetting> {
  const resp = await t.request(frame([CMD_GET_SLEDPARAM]))
  return {
    effect: resp[1],
    speed: resp[2],
    brightness: resp[3],
    option: resp[4] >> 4,
    colour: resp[4] & 0xf,
    rgb: fromWire(resp[5], resp[6], resp[7]),
  }
}

export async function readKeyColours(t: Transport, profile: number): Promise<[number, number, number][]> {
  const bytes = await readPages(t, 6, (page) => frame([CMD_GET_USERPIC, profile, 0xff, page]))
  const out: [number, number, number][] = []
  for (let i = 0; i < bytes.length; i += 3) out.push([bytes[i], bytes[i + 1], bytes[i + 2]])
  return out
}

export async function writeKeyColours(t: Transport, profile: number, rgb: [number, number, number][]): Promise<void> {
  const chunks = pages(rgb.flat())
  for (let page = 0; page < 7; page++) {
    const isLast = page === 6 ? 1 : 0
    // ponytail: _setLightPic hardcodes the last page's declared length as 378-56*6=42, a 126-key
    // constant that undercounts SK75's real 128*3=384-byte buffer by 6 bytes — mirrored verbatim
    // since "byte layout exactly as _setLightPic" was explicit; unverified whether the firmware
    // actually drops those trailing 6 bytes (the last 2 keys' colour) or just uses the full page. ⚠
    const len = page === 6 ? 378 - 56 * 6 : 56
    await t.send(frame([CMD_SET_USERPIC, profile, 0xff, page, len, isLast, 0, 0, ...chunks[page]]))
  }
  await vendorSleep()
}
