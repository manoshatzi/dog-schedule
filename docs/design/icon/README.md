# App icon

Owner: designer · v1 · 2026-10-13

## Concepts

All three use the brand green ground with a cream mark. Comparison sheet:
[`concepts/compare.png`](concepts/compare.png). It shows each concept at 1024, 180, 60 and 29 px,
in an iOS rounded-square mask on light and dark backgrounds, at 4x pixel zoom, and inside the
Android circle mask with the 66dp safe zone drawn in.

| | Concept | Rationale |
|---|---|---|
| A | [Paw-check](concepts/concept-a.svg) | The paw's main pad is a bold check mark, so the mark reads as "dog task, done". |
| B | [Day ring](concepts/concept-b.svg) | A paw inside a ring for the day. The orange gap is the part of the day that is still open. |
| C | [Dog head + badge](concepts/concept-c.svg) | A floppy-eared dog face with an orange "done" check badge. |

## Recommendation: A, paw-check

- **It is the product in one shape.** Dog plus done maps to claim → done. Generic pet apps use a plain paw. Here the check replaces the pad, so the mark is a paw and a tick at once.
- **It holds up best at small sizes.** It has five solid shapes and no inner detail. At 29 px the toes and the check stay separate. B's ring and paw blur into a busy disc, and C loses its eyes and nose.
- **It works in one colour.** It needs no accent to read, so the Android themed icon and the iOS tinted icon look like the full-colour icon. B needs the orange arc to carry its meaning. C's badge turns into a blob in one colour.
- **It is not cute.** It fits the calm green UI better than C's character face.

## Colours

| Role | Hex |
|---|---|
| Icon ground, Android adaptive background, splash (light) | `#2F6B4F` primary green |
| Splash (dark) | `#1F4A36` darker green |
| Mark | `#F4F5F1` brand ground (cream). The iOS Icon Composer layer is `#FFFFFF`, because glass tints it. |
| Accent | none in the shipped icon. Orange `#D9822B` appears only in concepts B and C. |

## Files

Master SVGs (source of truth) are in `docs/design/icon/`. The check is an outlined filled path with no strokes, so every tool renders it the same way.

| Master | Produces | Notes |
|---|---|---|
| `icon.svg` | `assets/images/icon.png` (1024, opaque RGB, square) | Mark at 94%. The OS applies the mask. |
| `icon-foreground.svg` | `assets/images/android-icon-foreground.png` (512, transparent) | 1024 canvas = 108dp. Mark at 88% fits inside the 66dp safe circle. |
| — | `assets/images/android-icon-background.png` (512, solid `#2F6B4F`) | Same as `adaptiveIcon.backgroundColor`. |
| `icon-monochrome.svg` | `assets/images/android-icon-monochrome.png` (432, transparent) | Same geometry as the foreground. Android uses only the alpha channel. |
| `splash-icon.svg` | `assets/images/splash-icon.png` (1024, transparent) | Mark scaled to fill the square. The splash shows it at `imageWidth` 120. |
| `favicon.svg` | `assets/images/favicon.png` (48) | Rounded square, mark at 100%. |
| `paw-check-layer.svg` | `assets/expo.icon/Assets/paw-check.svg` (copy) | Icon Composer layer. Its viewBox is centred on the canvas centre (512,512), so translation `[0,0]` and scale `0.94` match `icon.png`. |
| `concepts/make-compare.py` | `concepts/concept-*.svg`, `concepts/compare.png` | Run `python3 -I docs/design/icon/concepts/make-compare.py "$PWD" /tmp/icon-work` |

### iOS (Icon Composer bundle `assets/expo.icon/`)

`app.json` → `ios.icon: ./assets/expo.icon`. That is the Liquid Glass format, supported in SDK 54 and later. The top-level `icon.png` stays as the fallback. Changes to the bundle in `icon.json`:

- The Expo symbol and the `grid.png` layer are removed. There is now one layer, `paw-check.svg`.
- Fill is `automatic-gradient` from brand green, `extended-srgb:0.18431,0.41961,0.30980`.
- Translucency is off, so the mark stays solid and legible. The shadow is neutral at 0.5.

Icon Composer manages dark and tinted appearances automatically. To fine-tune them, open the bundle in Apple's Icon Composer. It is a plain folder, so it opens directly.

## Regenerate the PNGs

Run from the repo root (needs `rsvg-convert` and `magick` from Homebrew):

```bash
D=docs/design/icon; A=assets/images
rsvg-convert -w 1024 -h 1024 $D/icon.svg | magick - -background '#2F6B4F' -flatten -alpha off PNG24:$A/icon.png
rsvg-convert -w 512 -h 512 $D/icon-foreground.svg -o $A/android-icon-foreground.png
magick -size 512x512 xc:'#2F6B4F' PNG24:$A/android-icon-background.png
rsvg-convert -w 432 -h 432 $D/icon-monochrome.svg -o $A/android-icon-monochrome.png
rsvg-convert -w 1024 -h 1024 $D/splash-icon.svg -o $A/splash-icon.png
rsvg-convert -w 48 -h 48 $D/favicon.svg -o $A/favicon.png
cp $D/paw-check-layer.svg assets/expo.icon/Assets/paw-check.svg
```

## app.json (icon and splash keys only)

- `android.adaptiveIcon.backgroundColor`: `#E6F4FE` → `#2F6B4F`
- `expo-splash-screen`: `backgroundColor` `#208AEF` → `#2F6B4F`, `imageWidth` 76 → 120, `resizeMode: "contain"`, and a new `dark` entry with `backgroundColor` `#1F4A36` and the same image. Going from the green splash to the cream app ground matches the icon the user just tapped.

## Seeing it on a device

Icons and splash screens are native resources, so a JS reload or `eas update` does not change them. Make a new native build:

- Local: `yarn expo prebuild --clean`, then `yarn expo run:ios` / `yarn expo run:android`
- Cloud: `yarn dlx eas-cli@latest build --profile development` (or preview/production)

The checked-in `ios/` folder holds the old Expo icon. Never edit it by hand. Regenerate it with prebuild. Splash changes are only reliable in a preview or production build, not in Expo Go. On iOS, delete the old app first, because SpringBoard caches icons.

## In-app splash

After the native splash, `src/components/splash-overlay.tsx` draws an identical screen (same colours, `splash-icon.png` at 120×120) so the hand-off can't be seen. It stays up until the first real screen is ready (sign-in, onboarding or Today), with a 4-second cap. Then the mark dips slightly, grows and fades while the green fades to the app. Its colours and size must stay in sync with the `expo-splash-screen` entry in `app.json`. The old template overlay (`animated-icon*.tsx`, `expo-logo.png`, `logo-glow.png`) has been removed.
