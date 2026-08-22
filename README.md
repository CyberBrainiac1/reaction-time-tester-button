# Giant-Button Reaction Time Tester

A complete Arduino Nano + Windows browser reaction tester. The Nano reports the first electrical press immediately over USB serial; the React app displays GO, measures message arrival with the browser clock, rejects false starts, retains session statistics, and exports CSV diagnostics.

## Project layout

```text
reaction-time-tester/
├─ arduino/reaction_time_nano/reaction_time_nano.ino
├─ frontend/
│  ├─ src/serial/SerialManager.ts
│  ├─ src/types, utils, config.ts, App.tsx, styles.css
│  └─ package.json
├─ docs/wiring.md
├─ docs/timing.md
└─ docs/serial-protocol.md
```

## Quick start on a blank Windows laptop

1. Unplug USB. Wire either center-switch terminal to Nano `D2`, and the other to `GND`. Leave the four return-spring switches unwired. See [docs/wiring.md](docs/wiring.md).
2. Install [Arduino IDE 2](https://www.arduino.cc/en/software), connect the Nano by USB, and open `arduino/reaction_time_nano/reaction_time_nano.ino`.
3. In **Tools**, choose **Board → Arduino AVR Boards → Arduino Nano**, then select the Nano's COM port. Choose **Processor → ATmega328P**. If upload reports a sync error on an older clone, choose **ATmega328P (Old Bootloader)** and upload again.
4. Click Upload. Optionally open Serial Monitor at 115200 baud; it shows `READY` after startup and prints one `PRESS` and one `RELEASE` per actuation. Close Serial Monitor before using the web app because only one program can own the COM port.
5. Open the public GitHub Pages website in desktop Chrome or Edge. No web-app installation is needed. Web Serial does not work in Firefox and requires HTTPS or localhost.
7. Click **Connect Arduino**, choose the Nano's COM port, and click **Connect** in the browser prompt. If several ports appear, unplug/replug the Nano and note which COM entry disappears/reappears; Windows Device Manager → **Ports (COM & LPT)** also shows it.
8. Confirm **BUTTON RELEASED**, click **Start trial**, wait for the green **GO!**, and press the giant button. Release it before the next trial.

For keyboard-only development, choose **Use keyboard simulator**, then use Space. Simulated rows are labeled in the UI and CSV; do not combine them with hardware measurements when analyzing performance.

## Editing the website

The frontend is deliberately simple and build-free:

- `frontend/index.html` is the page structure.
- `frontend/styles.css` is all colors and layout.
- `frontend/app.js` is the behavior; its settings are clearly labeled at the top.

Edit those three files directly on GitHub or in any text editor. Commit to `main` and GitHub Pages republishes automatically. No React, TypeScript, Vite, npm, package installation, or generated files are involved.

## Trial safety and reliability

- A held button disables Start. `ARM` also makes the Nano independently reject a held switch.
- A press during the random 1.5–5 second wait records a false start and cancels GO.
- The Nano accepts the first LOW immediately, latches it, and only re-arms after HIGH has remained stable for 5 ms. No pre-press debounce is used.
- Losing page visibility or window focus during waiting/GO invalidates the trial. An unplug, reset, malformed line, or serial error stops the trial instead of inventing a result.
- The serial manager owns one reader and writer, buffers split packets, closes stream locks, and prevents duplicate connections.
- Session history intentionally lives in memory. Refreshing clears it, avoiding stale results after an unknown hardware state. Export before refreshing.

## Testing procedure

1. With Serial Monitor, press and hold: verify exactly one `PRESS`. Release: verify exactly one `RELEASE`. Wiggle/bounce the switch and repeat.
2. Hold the switch and send `ARM`: verify `ERROR,BUTTON_HELD`.
3. In the app, start and press before GO: verify **TOO EARLY** and a false-start row in CSV.
4. Start normally: verify GO fills the screen, the result appears, and another trial is unavailable until release.
5. During waiting and during GO, switch tabs: verify the trial is invalidated.
6. Unplug during waiting: verify an error with recovery instead of a result. Reconnect and run again.
7. Run several hardware trials and one separate simulator session; export CSV and verify source, raw browser timestamps, Nano microseconds, validity, and false-start fields.
8. After any edit, test hardware and simulator mode in Chrome or Edge before committing to `main`.

## Troubleshooting

| Problem | Fix |
|---|---|
| No port chooser | Use desktop Chrome/Edge and the localhost Vite URL. Check USB data cable and browser permissions. |
| Port busy / failed to open | Close Arduino Serial Monitor, other terminals, and other tabs using the port; unplug/replug and reconnect. |
| Upload `avrdude: stk500_recv` error | Select the correct COM port and try **ATmega328P (Old Bootloader)** for clone/older Nanos. |
| App times out on READY | The Nano resets when opened. Disconnect, wait two seconds, reconnect; verify firmware and 115200 baud in Serial Monitor. |
| Button always held | Check for a short between D2 and GND. Released must read HIGH using `INPUT_PULLUP`. |
| Multiple presses | Confirm the center switch alone is wired and firmware matches this repository. Release must be stable for 5 ms before re-arming. |
| Implausibly fast result | Do not press before GO; check monitor/game-mode settings and compare only consistent setups. Inspect diagnostics and invalidate interrupted trials. |

See [timing limitations](docs/timing.md) before interpreting sub-frame differences and [the protocol](docs/serial-protocol.md) when extending the system.

## Public GitHub Pages deployment

This repository includes `.github/workflows/deploy-pages.yml`. Every push to `main` validates the three static files and publishes the frontend. It also enables GitHub Pages automatically. The public HTTPS site can use Web Serial in desktop Chrome or Edge; every visitor must choose and authorize their own Nano's COM port.
