/* Giant button serial input. The website handles all delay and scoring. */
#include <Arduino.h>

constexpr uint8_t BUTTON_PIN = 2;
constexpr unsigned long BAUD_RATE = 115200;
constexpr uint32_t RELEASE_STABLE_US = 5000UL;

bool pressLatched = false;
bool releaseCandidate = false;
uint32_t releasedAt = 0;

void sendEvent(const __FlashStringHelper* name, uint32_t timestamp) {
  Serial.print(name);
  Serial.print(',');
  Serial.println(timestamp);
}

void setup() {
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  Serial.begin(BAUD_RATE);
  pressLatched = (digitalRead(BUTTON_PIN) == LOW);
  Serial.println(F("READY"));
}

void loop() {
  const bool pressed = digitalRead(BUTTON_PIN) == LOW;
  const uint32_t now = micros();

  // Send the very first LOW immediately; never wait to debounce before PRESS.
  if (!pressLatched && pressed) {
    pressLatched = true;
    releaseCandidate = false;
    sendEvent(F("PRESS"), now);
    return;
  }
  if (!pressLatched) return;
  if (pressed) { releaseCandidate = false; return; }

  // Debounce only after a press. Unsigned subtraction handles micros rollover.
  if (!releaseCandidate) {
    releaseCandidate = true;
    releasedAt = now;
  } else if (static_cast<uint32_t>(now - releasedAt) >= RELEASE_STABLE_US) {
    pressLatched = false;
    releaseCandidate = false;
    sendEvent(F("RELEASE"), now);
  }
}
