// telemetry.ino — Genera datos de telemetría simulados para PoC 1
// Formato: CSV con timestamp, accX, accY, accZ, gyroX, gyroY, gyroZ, battery

const unsigned long INTERVAL_MS = 16; // ~60 Hz
unsigned long lastTime = 0;
unsigned long frameCount = 0;

void setup() {
  Serial.begin(115200);
  while (!Serial) { ; }
}

void loop() {
  unsigned long now = millis();
  if (now - lastTime < INTERVAL_MS) return;
  lastTime = now;
  frameCount++;

  // Simular datos de sensores
  float accX = sin(frameCount * 0.1) * 9.8;
  float accY = cos(frameCount * 0.1) * 9.8;
  float accZ = 9.8 + sin(frameCount * 0.05) * 0.5;
  float gyroX = sin(frameCount * 0.15) * 180.0;
  float gyroY = cos(frameCount * 0.15) * 180.0;
  float gyroZ = 0.0;
  float battery = 100.0 - (frameCount * 0.01);

  Serial.print(frameCount * INTERVAL_MS);
  Serial.print(",");
  Serial.print(accX, 2);
  Serial.print(",");
  Serial.print(accY, 2);
  Serial.print(",");
  Serial.print(accZ, 2);
  Serial.print(",");
  Serial.print(gyroX, 2);
  Serial.print(",");
  Serial.print(gyroY, 2);
  Serial.print(",");
  Serial.print(gyroZ, 2);
  Serial.print(",");
  Serial.println(battery, 2);
}
