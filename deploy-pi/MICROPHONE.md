# Microphone setup & troubleshooting (Raspberry Pi kiosk)

Everything needed to get the USB gaming mic recording **clean audio** and feeding
the kiosk app correctly. Read the "Mental model" section first — it explains why
the obvious `arecord` test can mislead you.

---

## TL;DR — the fast path

```bash
# 1. Find the card number of the USB mic (look for your mic's name)
arecord -l

# 2. See what the mic ACTUALLY supports natively (don't guess the rate!)
arecord --dump-hw-params -D hw:<CARD>,0

# 3. Record through the PLUG layer (auto-resamples) at the mic's NATIVE rate.
#    Most USB gaming mics are 48000 Hz stereo, NOT 44100 mono.
arecord -D plughw:<CARD>,0 -f S16_LE -r 48000 -c 1 -t wav -d 5 test.wav && aplay test.wav

# 4. Set capture gain to ~70-80% (too-high gain = clipping/distortion)
alsamixer -c <CARD>      # F4 = capture view, arrows to set, Esc to exit

# 5. THE REAL TEST: make the mic the default PulseAudio source, then test
#    in Chromium — because the app records via the browser, not arecord.
```

> **The #1 mistake:** testing only with `arecord -D hw:3,0` and tuning that.
> The kiosk app does **not** use raw ALSA. It uses Chromium `getUserMedia` →
> PulseAudio/PipeWire. A perfect `arecord` test can still give bad app audio,
> and vice-versa. Always finish by testing in the browser.

---

## Mental model — how audio actually flows in this project

```
USB gaming mic
   │  (USB Audio Class)
   ▼
ALSA  ──────────────►  arecord / aplay         ← your terminal test path
   │                   (raw `hw:` = no resample)
   ▼
PulseAudio / PipeWire ─────────────────────────┐
   │  (default "source")                        │
   ▼                                            │
Chromium  getUserMedia({ audio: true })         │  ← the path the APP uses
   │  WebRTC: auto AGC + noise-suppress + echo   │
   ▼                                            │
MediaRecorder → audio/webm;codecs=opus → base64 ┘
   │
   ▼
/api/* (Node, in Docker) → Gemini (speech understanding)
```

Key consequences:

- **`arecord -D hw:3,0` skips PulseAudio and WebRTC entirely.** It's useful to
  prove the hardware works, but it is *not* what the app hears.
- The browser path picks the **default PulseAudio source**. If that default is
  the Pi's onboard input (or HDMI) instead of your USB mic, the app records
  silence/garbage no matter how good `arecord` sounds.
- WebRTC applies **Automatic Gain Control, noise suppression, and echo
  cancellation** by default. These usually help, but on a hot gaming-mic signal
  they can pump/distort. See "WebRTC processing" below.

App-side facts (from `src/services/voice/audioRecorder.ts`):

| Setting | Value | Why it matters |
|---|---|---|
| Capture API | `getUserMedia({ audio: true })` | Uses the **default** source; no device pinning |
| Encoding | `audio/webm;codecs=opus` (fallbacks: webm, ogg/opus, ogg) | Opus is robust; not the quality bottleneck |
| Silence threshold | RMS `0.025` | If gain is too low, app thinks you never spoke |
| Silence stop | `1200 ms` of quiet after speech (`2500 ms` on the prompt step) | Background hum above threshold = never stops |
| Grace period | `1000 ms` before silence counts | Time to start talking |
| Max clip length | `7000 ms` (`25000 ms` on the prompt step) | Short answers cut at 7 s; describe-your-change allows 25 s |

So the mic must be (a) the default source, (b) loud enough to clear RMS 0.025,
and (c) quiet enough between words that the recorder stops.

> The **describe-your-change** step uses a longer window (25 s max, 2.5 s
> silence) via `PROMPT_RECORD_OPTIONS` in `src/hooks/useVoiceFlow.ts`; the values
> in the table above are the defaults used by every other step.

---

## Why `arecord -D hw:3,0 ... -r 44100` sounded bad — the 3 usual causes

1. **Raw `hw:` does no conversion.** If the mic's native rate is 48000 Hz and
   you ask `hw:` for 44100, you get a mismatch / forced odd behaviour. **Use
   `plughw:`** — it inserts ALSA's resampler. This alone fixes most cases.
2. **Wrong native rate / channel count.** Gaming mics are commonly **48000 Hz,
   2-channel**. Recording `-r 44100 -c 1` against that can degrade. Read
   `--dump-hw-params` and match it (then let `plughw` convert if needed).
3. **Capture gain too high → clipping.** USB mic "boost" on the Pi is often
   maxed, producing crunchy/distorted audio. Pull it to ~70-80% in `alsamixer`.

Secondary causes: insufficient USB power, and `aplay` itself sounding bad on the
Pi's weak headphone DAC (test by copying `test.wav` to a laptop and playing it
there to isolate record-vs-playback).

---

## Step-by-step diagnosis

### Step 1 — Confirm the device and its native capabilities

```bash
arecord -l                              # list capture devices, note the card #
arecord --dump-hw-params -D hw:<CARD>,0 # native RATE / CHANNELS / FORMAT
```

Record the values it prints (e.g. `RATE: 48000`, `CHANNELS: 2`,
`FORMAT: S16_LE`). Use those below. Note: **the card number can change across
reboots** — see "Pin the device" to make it stable.

### Step 2 — Clean raw-hardware capture (proves the mic is good)

```bash
# Use the NATIVE rate/channels from step 1, via plughw for safety.
arecord -D plughw:<CARD>,0 -f S16_LE -r 48000 -c 2 -t wav -d 5 raw.wav
```

Play it back on a **laptop** (not the Pi) to judge true quality:

```bash
scp raw.wav you@laptop:~    # or copy via USB stick
```

- Clean on laptop, bad through `aplay` on Pi → playback/DAC problem, not the mic.
- Bad even on laptop → continue to gain / power / rate fixes.

### Step 3 — Set capture gain correctly

```bash
alsamixer -c <CARD>
# F4 → Capture view. Use ← → to pick the Mic/Capture control, ↑ ↓ to set ~75%.
# If there's a "Mic Boost" or "Auto Gain Control", turn boost DOWN / AGC OFF.
# Press M to unmute if the control shows MM. Esc to exit.

sudo alsactl store          # persist mixer levels across reboot
```

Non-interactive equivalents (control name varies by mic — `amixer -c <CARD>`
lists them):

```bash
amixer -c <CARD> sset 'Mic' 75% cap
amixer -c <CARD> sset 'Auto Gain Control' off   # if present
```

### Step 4 — Rule out USB power (classic Pi audio glitch source)

- Use the **official 3A USB-C** Pi power supply. Brown-outs cause dropouts/static.
- Plug the mic into a **USB 2.0 (black) port**, or use a **powered USB hub**.
- Check for under-voltage / USB resets:
  ```bash
  dmesg | grep -iE 'voltage|usb .*(disconnect|reset|over-current)'
  vcgencmd get_throttled        # 0x0 = healthy; anything else = power issues
  ```

### Step 5 — Make the mic the DEFAULT source (this is what the app uses)

The kiosk browser records whatever PulseAudio/PipeWire calls "default". Set it:

```bash
# List input sources; copy the USB mic's NAME (the long alsa_input.usb-... string)
pactl list short sources

# Make it the default for new streams
pactl set-default-source <SOURCE_NAME>

# Optional: sane volume + disable hardware/extra software boost
pactl set-source-volume <SOURCE_NAME> 75%
pactl set-source-mute   <SOURCE_NAME> 0
```

PipeWire (Pi OS Bookworm) speaks the `pactl` protocol, so the same commands work.
Quick PipeWire alternatives: `wpctl status` and
`wpctl set-default <ID>` / `wpctl set-volume <ID> 0.75`.

Test the PulseAudio path (closer to the app than `arecord`):

```bash
parecord --rate=48000 --channels=1 pa_test.wav   # speak ~5s, Ctrl-C
paplay pa_test.wav
```

### Step 6 — THE REAL TEST: record in Chromium

This is the only test that matches production.

1. Open Chromium on the Pi and go to: **`chrome://settings/content/microphone`**
   → confirm the USB mic is the selected default and the site is allowed.
2. Visit a mic test page (e.g. an online "mic test") **or** the kiosk app itself
   and use the voice feature. Confirm:
   - the level meter moves when you speak,
   - playback is clean,
   - it isn't picking the wrong device.
3. If Chromium can't see the mic at all, fully quit and relaunch (it caches the
   device list at startup — relevant for the kiosk service after hotplugging).

---

## Persisting the configuration (so it survives reboot / the kiosk service)

The kiosk runs headless via `kiosk.service` + autologin, so settings must be
saved at the system level — you won't be there to click anything.

### Pin the device name (card numbers are unstable)

Reference the mic by name instead of `hw:3,0`. List names:

```bash
cat /proc/asound/cards
```

Then in `arecord`/`aplay` you can use `-D plughw:CARD=<Name>` (e.g.
`plughw:CARD=Microphone`). For PulseAudio/PipeWire you already use the stable
`alsa_input.usb-...` source name from Step 5 — that does not change.

### Make the USB mic the global ALSA default (optional but tidy)

Create `/etc/asound.conf` (replace `<CARD>` with the name from
`/proc/asound/cards`):

```
defaults.pcm.card <CARD>
defaults.ctl.card <CARD>
```

### Persist gain and PulseAudio default

```bash
sudo alsactl store                       # ALSA mixer levels
```

For the PulseAudio/PipeWire default source, set it for the **pi** user that the
kiosk runs as. Add to `/home/pi/.config/pulse/default.pa` (create if missing):

```
.include /etc/pulse/default.pa
set-default-source <SOURCE_NAME>
```

> **PipeWire (Pi OS Bookworm) caveat:** `default.pa` is a classic PulseAudio
> mechanism and pipewire-pulse may ignore it. To persist the default source
> there, use a WirePlumber rule, or a small `systemd --user` unit that runs
> `wpctl set-default <ID>` on login. Verify after a reboot with `pactl info |
> grep "Default Source"`.

> The `kiosk.service` user is **pi** (see `kiosk.service`). Make sure all the
> above is configured under that user, not root.

---

## WebRTC processing — if audio is robotic, pumping, or over-suppressed

By default `getUserMedia({ audio: true })` enables AGC + noise suppression +
echo cancellation in Chromium. For a clean gaming mic in a noisy expo hall this
is usually *desired* (it cuts crowd noise). But if it makes speech sound
pumped/garbled, you can pin constraints in the app.

In `src/services/voice/audioRecorder.ts`, the capture call is currently:

```ts
const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
```

To experiment, replace the constraint object, e.g.:

```ts
const stream = await navigator.mediaDevices.getUserMedia({
  audio: {
    channelCount: 1,
    echoCancellation: true,    // keep ON near speakers; OFF if headset only
    noiseSuppression: true,    // helps in a loud expo hall; OFF if it garbles
    autoGainControl: true,     // ON smooths levels; OFF if it pumps
    // deviceId: { exact: '<id>' }, // pin the USB mic instead of "default"
  },
});
```

Tuning guide for the booth:
- **Loud hall, app misses speech** → keep `noiseSuppression`/`autoGainControl` ON.
- **Voice sounds watery/robotic** → try `noiseSuppression: false`.
- **Levels pump up and down** → try `autoGainControl: false` and set gain in
  `alsamixer` instead.
- **App stops too early / never stops** → adjust `silenceThreshold` (raise if it
  never stops due to hall noise; lower if it cuts you off) and `maxDurationMs`
  in the same file.

To pin the exact device instead of relying on the default source, enumerate
devices (`navigator.mediaDevices.enumerateDevices()`), grab the USB mic's
`deviceId`, and pass it as `deviceId: { exact: ... }`.

> **Docker rebuild required.** The frontend is baked into the `web` image at
> build time, so editing `audioRecorder.ts` (or `useVoiceFlow.ts`) has no effect
> until you rebuild that container:
> ```bash
> cd deploy-pi && docker compose up -d --build web
> ```

---

## Quick reference — copy/paste test block

```bash
# Discover
arecord -l
arecord --dump-hw-params -D hw:<CARD>,0

# Raw hardware (judge on a laptop)
arecord -D plughw:<CARD>,0 -f S16_LE -r 48000 -c 1 -t wav -d 5 test.wav && aplay test.wav

# Gain
alsamixer -c <CARD>          # ~75%, boost down / AGC off
sudo alsactl store

# Power sanity
vcgencmd get_throttled       # want 0x0

# PulseAudio/PipeWire (closer to the app)
pactl list short sources
pactl set-default-source <SOURCE_NAME>
pactl set-source-volume  <SOURCE_NAME> 75%
parecord --rate=48000 --channels=1 pa_test.wav && paplay pa_test.wav

# Final: test in Chromium  → chrome://settings/content/microphone
```

---

## Troubleshooting matrix

| Symptom | Likely cause | Fix |
|---|---|---|
| `arecord` audio crunchy/distorted | Gain too high / boost on, or raw `hw:` rate mismatch | `alsamixer` to ~75%, boost off; use `plughw:` at native rate |
| Sounds bad on Pi `aplay`, fine on laptop | Pi headphone DAC, not the mic | Ignore for recording; use USB/HDMI out for playback |
| App records silence; `arecord` is fine | USB mic isn't the default PulseAudio source | `pactl set-default-source` + persist in `default.pa` |
| App "never heard you speak" | Level below RMS 0.025 | Raise capture gain / PulseAudio source volume |
| App cuts you off mid-sentence | Hall noise above threshold, or 7 s cap | Tune `silenceThreshold` / `maxDurationMs` in `audioRecorder.ts` |
| Voice robotic / pumping | WebRTC noise-suppress / AGC | Set `noiseSuppression`/`autoGainControl: false` in constraints |
| Works, breaks after reboot | Card number changed / settings not persisted | Pin by name (`/proc/asound/cards`), `alsactl store`, `default.pa` |
| Dropouts / static under load | USB under-power | 3A PSU, USB 2.0 port or powered hub; check `vcgencmd get_throttled` |
| Chromium can't see hotplugged mic | Device list cached at launch | Restart Chromium / `kiosk.service` |
| Mic only in laptop, not Pi at all | USB enumeration / power | `lsusb`, `dmesg | grep -i usb`, try another port/hub |

---

## Notes specific to this deployment

- The **browser is not containerised** (see `README.md`), so all audio config is
  on the **Pi host**, not inside Docker. You do not need to touch the `api`/`web`
  containers for mic issues.
- The kiosk runs as user **pi** via `kiosk.service`; persist PulseAudio/ALSA
  settings for that user.
- Speech is understood server-side by Gemini via `/api/*`. If capture is clean
  but transcription is wrong, that's a model/prompt issue, not the mic — verify
  with a clean `pa_test.wav` first to split the problem.
