# Dark Ember — animated game front-end

A self-contained title screen built on a single still image: the bonfire burns,
embers stream upward, sparks scatter on click, ash drifts and fog rolls past.
No build step, no dependencies — open `index.html` in a browser.

```
game/
├── index.html        # screens: title, how-to-play, game over, HUD
├── style.css         # ember gradient title, menus, HUD
├── game.js           # canvas engine: background, firelight, particles, gameplay
├── audio.js          # Web Audio engine: fire, sparks, ambient score
└── assets/bonfire.jpg
```

## Running it

```bash
# straight from disk
xdg-open game/index.html          # macOS: open game/index.html

# or over a local server
python3 -m http.server 8000 -d game
```

Append `#play` to the URL to jump straight into a run.

## How it works

- **Everything is painted on one canvas** layered over the photo: the image is drawn
  with cover-fit plus a slow Ken Burns zoom, then firelight, embers, sparks, ash, fog
  and a vignette go on top. The HTML layer only holds text and buttons.
- **The fire is anchored to the image, not the screen.** `FIRE = { x: 0.503, y: 0.845 }`
  is a position *inside the photo*, mapped through the cover-fit rect each frame, so
  sparks stay on the bonfire at any window size or aspect ratio.
- **Particles use pre-rendered sprites** instead of a gradient per particle, and their
  size scales with the viewport, so phone portrait doesn't get blobs.
- **Flicker** is layered sine waves plus a small random jitter, smoothed toward a target
  each frame — it drives the halo, the flame core and the ember spawn rate together.

## Sound

Every sound is synthesised at runtime with the Web Audio API &mdash; there are no
audio files to download and nothing to license.

- **Fire** &mdash; looping brown noise through a lowpass that two slow LFOs keep
  breathing, with an airy bandpass layer on top. Random resonant pops are the crackle;
  they come faster and louder while the flame is strong.
- **Sparks** &mdash; a short noise burst through a bandpass sweeping upward, panned to
  where you struck it on screen. Rapid bursts are rate-limited so they never stack into mush.
- **Score** &mdash; a sub drone under a slow D-minor pad (Dm &rarr; B&flat; &rarr; Gm &rarr; A),
  with sparse FM bell notes drawn from a pentatonic set, all fed through a convolution
  reverb built from synthesised noise. Collecting an ember rings the next step of that
  scale, so a good run plays a melody.
- As the flame dies a heartbeat creeps in underneath, and the fire's volume and
  brightness follow the gauge.

Browsers only allow audio after a real interaction, so the engine builds itself on your
first click or keypress. Toggle it from the menu, from the HUD, or with **M**; the choice
is remembered in `localStorage`.

## The game

Embers rise from the fire; click them before they fade. Each one feeds the flame, which
burns down on its own — at zero the run ends. Best score is kept in `localStorage`.

Controls: click/tap to collect, `Enter` to start, `Esc` back to the menu, `M` to mute.
The **Quality** toggle halves the particle budget and drops the fog layer; it is picked
automatically for `prefers-reduced-motion`.

## Asset note

`assets/bonfire.jpg` is the image supplied for this screen. It is third-party artwork
included here as a placeholder — swap it for your own before distributing, and update
`FIRE` in `game.js` to the fire's position in the new image.
