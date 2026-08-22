#include <Arduino.h>

namespace {
constexpr uint8_t BUTTON_PIN = 2;
constexpr unsigned long BAUD_RATE = 115200;
constexpr uint32_t RELEASE_STABLE_US = 5000UL;
constexpr size_t COMMAND_CAPACITY = 24;

bool pressLatched = false;
bool releaseTiming = false;
uint32_t releaseCandidateAt = 0;
char commandBuffer[COMMAND_CAPACITY];
uint8_t commandLength = 0;

void sendEvent(const __FlashStringHelper* name, uint32_t timestamp) {
  Serial.print(name);
  Serial.print(',');
  Serial.println(timestamp);
}

void resetButtonState() {
  pressLatched = (digitalRead(BUTTON_PIN) == LOW);
  releaseTiming = false;
}

void handleCommand(const char* command) {
  if (strcmp(command, "PING") == 0) {
    Serial.println(F("PONG"));
  } else if (strcmp(command, "RESET") == 0) {
    resetButtonState();
    Serial.println(F("READY"));
  } else if (strcmp(command, "ARM") == 0) {
    if (digitalRead(BUTTON_PIN) == LOW) {
      Serial.println(F("ERROR,BUTTON_HELD"));
    } else {
      pressLatched = false;
      releaseTiming = false;
      Serial.println(F("ARMED"));
    }
  } else if (*command != '\0') {
    Serial.println(F("ERROR,UNKNOWN_COMMAND"));
  }
}

void serviceSerial() {
  while (Serial.available() > 0) {
    const char incoming = static_cast<char>(Serial.read());
    if (incoming == '\n' || incoming == '\r') {
      if (commandLength > 0) {
        commandBuffer[commandLength] = '\0';
        handleCommand(commandBuffer);
        commandLength = 0;
      }
    } else if (commandLength < COMMAND_CAPACITY - 1) {
      commandBuffer[commandLength++] = incoming;
    } else {
      commandLength = 0;
      Serial.println(F("ERROR,COMMAND_TOO_LONG"));
    }
  }
}

void serviceButton() {
  const bool pressed = (digitalRead(BUTTON_PIN) == LOW);
  const uint32_t now = micros();

  // Accept the first falling level immediately. Bounce is suppressed only
  // after the timestamp is captured and the PRESS line is sent.
  if (!pressLatched && pressed) {
    pressLatched = true;
    releaseTiming = false;
    sendEvent(F("PRESS"), now);
    return;
  }

  if (!pressLatched) return;
  if (pressed) {
    releaseTiming = false;
    return;
  }

  if (!releaseTiming) {
    releaseTiming = true;
    releaseCandidateAt = now;
    return;
  }

  // Unsigned subtraction is correct even when micros() rolls over.
  if (static_cast<uint32_t>(now - releaseCandidateAt) >= RELEASE_STABLE_US) {
    pressLatched = false;
    releaseTiming = false;
    sendEvent(F("RELEASE"), now);
  }
}
}  // namespace

void setup() {
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  Serial.begin(BAUD_RATE);
  resetButtonState();
  Serial.println(F("READY"));
}

void loop() {
  // Tight polling avoids ISR/Serial interaction and captures D2 quickly.
  serviceButton();
  serviceSerial();
}

