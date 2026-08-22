# Giant Button Reaction Time Tester

A simple Arduino Nano + browser reaction tester. The Nano only sends button events; the website controls the random wait, GO screen, false starts, timing, results, and CSV export.

## Use it

Open the public website in desktop Chrome or Edge:

https://cyberbrainiac1.github.io/reaction-time-tester-button/

Click **Connect Arduino**, choose the Nano's COM port, then start a trial. No website installation is required.

## Wiring

```text
Nano D2  ───── one terminal of the center MX switch
Nano GND ───── other terminal of the center MX switch
```

The four surrounding switches are mechanical return springs only and stay unwired. The firmware uses `INPUT_PULLUP`: released is HIGH and pressed is LOW.

## Arduino upload

Open `arduino/reaction_time_nano/reaction_time_nano.ino` in Arduino IDE. Choose **Arduino Nano**, your Nano's COM port, and **ATmega328P**. If an older clone fails to upload, try **ATmega328P (Old Bootloader)**.

## Edit the website

The complete website is three files:

- `frontend/index.html` — page content
- `frontend/styles.css` — colors and layout
- `frontend/app.js` — behavior and the wait-time settings at the top

Edit those files on GitHub or in any text editor. Commit to `main`; GitHub Pages republishes automatically.

## Serial messages

The Nano uses 115200 baud and sends newline-terminated messages:

```text
READY
PRESS,12345678
RELEASE,12678123
```

`PRESS` is sent immediately when the switch first goes LOW. A 5 ms stable-release check prevents switch bounce from making duplicate presses. After connection, the website sends twelve `PING,<number>` probes and the Nano immediately returns `PONG,<number>,<micros>` for each one.

## Timing note

After connecting, the website averages twelve round-trip probes and uses half of that average as the Nano-to-browser link-delay estimate. It subtracts that number from every reaction time and saves both the raw and corrected values in the CSV. USB and browser scheduling are not perfectly symmetric, so this is a practical estimate—not laboratory-grade end-to-end timing calibration. Monitor/display latency remains outside this correction.
