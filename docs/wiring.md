# Wiring

Disconnect USB power before wiring.

```text
Arduino Nano                         Center MX switch
┌─────────────┐                     ┌───────────────┐
│          D2 ├─────────────────────┤ terminal 1    │
│         GND ├─────────────────────┤ terminal 2    │
└─────────────┘                     └───────────────┘
```

Switch polarity does not matter. The four surrounding MX switches are mechanical return springs only; do not connect them. Firmware uses `INPUT_PULLUP`, so released is HIGH and pressed is LOW. No external resistor is needed.

For a long cable, route signal and ground together, keep them away from motors and mains wiring, and verify the input is stable in Arduino IDE's Serial Monitor.

