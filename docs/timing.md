# Timing and measurement limits

The displayed result is:

```text
browser time when PRESS line is fully received
− browser time sampled immediately after the GO paint opportunity
```

The app applies the GO state, then samples `performance.now()` inside the next `requestAnimationFrame` callback immediately before the browser's paint opportunity. This is closer to visible presentation than timestamping the state update, but it cannot measure the monitor's photons.

The physical first press is timestamped immediately on the Nano. It is sent before release debounce. Since Nano `micros()` and browser `performance.now()` use unrelated clocks, their raw values are retained but never directly subtracted.

Expected uncertainty includes:

- Monitor refresh quantization: up to one refresh interval (16.7 ms at 60 Hz, 6.9 ms at 144 Hz), plus scanout.
- Display processing and pixel response, commonly several milliseconds and device-dependent.
- Browser event-loop and compositor scheduling. A hidden or unfocused page invalidates the trial.
- USB full-speed polling, USB-to-serial bridge buffering, driver scheduling, and line transmission. A short PRESS line at 115200 baud takes roughly 1–2 ms on the wire, with additional OS scheduling jitter.
- Nano polling and `micros()` resolution (4 μs on a 16 MHz ATmega328P), which is far smaller than display/USB uncertainty.

Results are shown to one decimal for repeatability analysis, not as a claim of 0.1 ms physical accuracy. Use the same computer, display mode, browser, port, and power settings when comparing sessions. Disable battery saving, background-heavy software, and display motion smoothing. A photodiode plus an electrical switch measurement is required for laboratory-grade end-to-end calibration.
