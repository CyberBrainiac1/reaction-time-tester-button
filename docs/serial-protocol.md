# Serial protocol

The link is 115200 baud, 8 data bits, no parity, one stop bit. Every message is ASCII and newline terminated. The receiver tolerates CRLF. The frontend buffers partial USB chunks and parses only complete lines.

## Nano to laptop

| Message | Meaning |
|---|---|
| `READY` | Firmware started or reset |
| `PONG` | Reply to `PING` |
| `ARMED` | Button was released when `ARM` was received |
| `PRESS,12345678` | First observed HIGH-to-LOW press; value is `micros()` |
| `RELEASE,12678123` | Release stable for 5 ms; value is `micros()` |
| `ERROR,message` | Command or device-state problem |

## Laptop to Nano

| Message | Meaning |
|---|---|
| `PING` | Request `PONG` |
| `RESET` | Reset firmware button latch and return `READY` |
| `ARM` | Verify release and prepare for one press |

Unknown, oversized, or malformed lines are rejected. The Nano emits no continuous telemetry. `micros()` wraps about every 71.6 minutes; timestamps are diagnostics only and are not subtracted from the browser clock.

