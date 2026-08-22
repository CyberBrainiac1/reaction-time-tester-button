# Serial protocol

The link is 115200 baud, 8 data bits, no parity, one stop bit. Every message is ASCII and newline terminated. The Nano never needs a command from the website: it is simply a low-latency button-event sender. The receiver buffers split USB chunks and parses only complete lines.

| Nano message | Meaning |
|---|---|
| `READY` | Firmware started or reset |
| `PRESS,12345678` | First observed HIGH-to-LOW press; value is `micros()` |
| `RELEASE,12678123` | Release stable for 5 ms; value is `micros()` |

The Nano emits no continuous telemetry. It sends PRESS immediately before any debounce work, then waits for a 5 ms stable release before it can report another press. `micros()` wraps about every 71.6 minutes; timestamps are diagnostics only and are not subtracted from the browser clock.
