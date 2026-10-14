
#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <MFRC522.h>
#include <SPI.h>
#include <WiFi.h>
#include <esp_system.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include "live_scan_config.h"

// Add the active session ID here only if your backend requires it.
const char *SESSION_ID = "";

// RC522 RFID Reader — SPI
#define RFID_SS_PIN    21
#define RFID_RST_PIN   22
#define RFID_SCK_PIN   18
#define RFID_MISO_PIN  19
#define RFID_MOSI_PIN  23

// OLED Display — I2C
#define OLED_SDA_PIN   25
#define OLED_SCL_PIN   26
const uint8_t OLED_WIDTH = 128;
const uint8_t OLED_HEIGHT = 64;
const int8_t OLED_RESET_PIN = -1;
const uint8_t OLED_I2C_ADDRESS = 0x3C;

const unsigned long WIFI_CONNECT_TIMEOUT_MS = 30000;
const unsigned long RESULT_TIMEOUT_MS = 90000;
const unsigned long POLL_INTERVAL_MS = 1000;
const unsigned long HTTP_TIMEOUT_MS = 8000;

MFRC522 reader(RFID_SS_PIN, RFID_RST_PIN);
Adafruit_SSD1306 display(
  OLED_WIDTH, OLED_HEIGHT, &Wire, OLED_RESET_PIN
);

static String lastScannedUid;
static bool oledReady = false;
static bool readerReady = false;
const uint8_t MAX_PENDING_SCANS = 3;

struct PendingScan {
  String scanId;
  String lastStatus;
  unsigned long startedAt;
  bool active;
};

static PendingScan pendingScans[MAX_PENDING_SCANS];
static uint8_t nextPendingScanIndex = 0;
static unsigned long lastStatusPollAt = 0;

static void showOLED(const String &line1, const String &line2 = "") {
  if (!oledReady) return;

  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.println(line1);
  display.setCursor(0, 20);
  display.println(line2);
  display.display();
}

static void initOLED() {
  Wire.begin(OLED_SDA_PIN, OLED_SCL_PIN);

  oledReady = display.begin(
    SSD1306_SWITCHCAPVCC, OLED_I2C_ADDRESS
  );

  if (oledReady) {
    showOLED("Smart Attendance", "Starting...");
    Serial.println("OLED initialized at I2C address 0x3C.");
  } else {
    Serial.println(
      "OLED not found at 0x3C; check wiring or try address 0x3D."
    );
  }
}

static void makeIdempotencyKey(char *key, size_t capacity) {
  uint8_t bytes[16];
  esp_fill_random(bytes, sizeof(bytes));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  snprintf(
    key, capacity,
    "%02x%02x%02x%02x-%02x%02x-%02x%02x-%02x%02x-%02x%02x%02x%02x%02x%02x",
    bytes[0], bytes[1], bytes[2], bytes[3],
    bytes[4], bytes[5], bytes[6], bytes[7],
    bytes[8], bytes[9], bytes[10], bytes[11],
    bytes[12], bytes[13], bytes[14], bytes[15]
  );
}

static bool connectToWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  showOLED("Connecting Wi-Fi", "Please wait...");

  const unsigned long startedAt = millis();

  while (
    WiFi.status() != WL_CONNECTED &&
    millis() - startedAt < WIFI_CONNECT_TIMEOUT_MS
  ) {
    delay(500);
    Serial.print(".");
  }

  Serial.println();

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Wi-Fi connection failed.");
    showOLED("Wi-Fi failed", "Check network");
    return false;
  }

  Serial.print("Wi-Fi connected; DevKit IP: ");
  Serial.println(WiFi.localIP());

  showOLED("Wi-Fi connected", WiFi.localIP().toString());
  return true;
}

static String uidToString(const MFRC522::Uid &uid) {
  String value;

  for (byte index = 0; index < uid.size; ++index) {
    if (uid.uidByte[index] < 0x10) value += "0";
    value += String(uid.uidByte[index], HEX);
  }

  value.toUpperCase();
  return value;
}

static void addDeviceHeaders(
  HTTPClient &http,
  const char *idempotencyKey = nullptr
) {
  http.addHeader(
    "X-Attendance-Device-Key", ATTENDANCE_DEVICE_KEY
  );

  if (idempotencyKey != nullptr) {
    http.addHeader("Idempotency-Key", idempotencyKey);
  }
}

static bool requestScan(
  const String &uid,
  const char *idempotencyKey,
  String &scanId,
  String &studentName
) {
  String body = "{\"rfidUid\":\"" + uid + "\"";

  if (strlen(SESSION_ID) > 0) {
    body += ",\"sessionId\":\"" + String(SESSION_ID) + "\"";
  }

  body += "}";

  for (uint8_t attempt = 0; attempt < 2; ++attempt) {
    WiFiClient client;
    HTTPClient http;
    http.setTimeout(HTTP_TIMEOUT_MS);

    if (!http.begin(
      client,
      String(BACKEND_BASE_URL) + "/api/attendance/live-scans"
    )) {
      Serial.println("Could not open the backend scan-request URL.");
      showOLED("Backend error", "Cannot open URL");
      return false;
    }

    http.addHeader("Content-Type", "application/json");
    addDeviceHeaders(http, idempotencyKey);

    const int code = http.POST(body);
    String response;

    if (code > 0) response = http.getString();
    http.end();

    if (code >= 200 && code < 300) {
      DynamicJsonDocument document(768);

      if (
        deserializeJson(document, response) ==
        DeserializationError::Ok
      ) {
        scanId = document["data"]["scanId"].as<String>();
        studentName = document["data"]["studentName"].as<String>();

        if (scanId.length() == 36) {
          Serial.println("Scan request created; camera capture is pending.");
          if (studentName.length() > 0) {
            Serial.println("Student resolved; camera capture is pending.");
            showOLED("Student:", studentName);
          }
          return true;
        }
      }

      Serial.println(
        "Backend response did not contain a valid scanId."
      );
      showOLED("Invalid response", "Check backend");
    } else if (code > 0) {
      if (code == 401) {
        Serial.println(
          "Device authentication failed; check local key configuration."
        );
        showOLED("Device auth", "Failed (401)");
      } else if (code == 503) {
        Serial.println(
          "Backend attendance-device authentication is not configured."
        );
        showOLED("Backend setup", "Device key missing");
      } else if (code == 404) {
        Serial.println("RFID card is not registered to an active student.");
        showOLED("Student not found", "Check registration");
      } else if (code == 409) {
        Serial.println("Student has no active face reference.");
        showOLED("Face not enrolled", "Contact admin");
      } else {
        Serial.printf(
          "Scan request rejected by backend (HTTP %d).\n", code
        );
        showOLED("Scan request", "HTTP " + String(code));
      }

      return false;
    } else {
      Serial.printf("Scan request network error (%d).\n", code);
      showOLED("Network error", "Scan not sent");
    }

    Serial.printf(
      "Scan request attempt %u did not receive a usable response.\n",
      attempt + 1
    );
    delay(300);
  }

  return false;
}

static bool readResult(
  const String &scanId,
  String &lastStatus,
  bool &finished
) {
  WiFiClient client;
  HTTPClient http;
  http.setTimeout(HTTP_TIMEOUT_MS);

  if (!http.begin(
    client,
    String(BACKEND_BASE_URL) +
      "/api/attendance/live-scans/" + scanId
  )) {
    return false;
  }

  addDeviceHeaders(http);

  const int code = http.GET();
  String response;

  if (code > 0) response = http.getString();
  http.end();

  if (code != 200) {
    if (code == 401) {
      Serial.println(
        "Device authentication failed while checking scan result."
      );
    } else if (code > 0) {
      Serial.printf(
        "Could not read scan result (HTTP %d).\n", code
      );
    } else {
      Serial.printf(
        "Scan-result network request failed (%d).\n", code
      );
    }

    return false;
  }

  DynamicJsonDocument document(1024);

  if (
    deserializeJson(document, response) !=
    DeserializationError::Ok
  ) {
    Serial.println("Backend returned an invalid scan-result response.");
    return false;
  }

  const char *status = document["data"]["status"] | "";

  if (lastStatus != status) {
    lastStatus = status;

    if (lastStatus == "WAITING_CAMERA") {
      Serial.println("Pending: waiting for a fresh camera capture.");
      showOLED("Camera pending", "Waiting for image");
    } else if (lastStatus == "PROCESSING") {
      Serial.println(
        "Camera image received; verifying face against enrolled reference."
      );
      showOLED("Image received", "Verifying face...");
    }
  }

  if (strcmp(status, "SUCCEEDED") == 0) {
    const char *eventType =
      document["data"]["result"]["eventType"] | "UNKNOWN";

    Serial.printf("Face matched; attendance marked (%s).\n", eventType);
    showOLED("Face matched", "Attendance marked");
    finished = true;
  } else if (
    strcmp(status, "FAILED") == 0 ||
    strcmp(status, "EXPIRED") == 0
  ) {
    const char *message =
      document["data"]["result"]["message"] |
      "Scan was not accepted.";
    const char *reason =
      document["data"]["result"]["reason"] | "";

    if (strcmp(status, "EXPIRED") == 0) {
      Serial.println(
        "Camera capture request expired; attendance was not changed."
      );
      showOLED("Capture expired", "No change made");
    } else {
      Serial.printf(
        "Face or attendance verification rejected: %s\n", message
      );
      if (strcmp(reason, "FACE_MISMATCH") == 0) {
        showOLED("Face mismatch", "No attendance");
      } else if (strcmp(reason, "NO_FACE") == 0) {
        showOLED("No face detected", "Try again");
      } else if (strcmp(reason, "MULTIPLE_FACES") == 0) {
        showOLED("One face only", "Try again");
      } else if (strcmp(reason, "INVALID_IMAGE") == 0) {
        showOLED("Invalid image", "No attendance");
      } else if (strcmp(reason, "SERVICE_UNAVAILABLE") == 0) {
        showOLED("Camera unavailable", "Service offline");
      } else if (strcmp(reason, "NO_FACE_REFERENCE") == 0) {
        showOLED("Face not enrolled", "Contact admin");
      } else if (strcmp(reason, "NO_ACTIVE_SESSION") == 0) {
        showOLED("No active session", "No attendance");
      } else {
        showOLED("Scan rejected", "Attendance unchanged");
      }
    }

    finished = true;
  }

  return true;
}

static void processCard(const String &uid) {
  int pendingIndex = -1;
  for (uint8_t index = 0; index < MAX_PENDING_SCANS; ++index) {
    if (!pendingScans[index].active) {
      pendingIndex = index;
      break;
    }
  }

  if (pendingIndex < 0) {
    Serial.println("Scan queue is full; no new request was sent.");
    showOLED("Verification busy", "Try again shortly");
    return;
  }

  char idempotencyKey[37];
  makeIdempotencyKey(idempotencyKey, sizeof(idempotencyKey));

  String scanId;
  String studentName;

  Serial.println("RFID card detected.");
  Serial.println(
    "Waiting for fresh camera capture and backend verification."
  );

  showOLED("Card detected", "Requesting scan...");

  if (!requestScan(uid, idempotencyKey, scanId, studentName)) {
    Serial.println(
      "Could not create the scan request; attendance was not changed."
    );

    showOLED("Request failed", "No change made");
    return;
  }

  pendingScans[pendingIndex].scanId = scanId;
  pendingScans[pendingIndex].lastStatus = "";
  pendingScans[pendingIndex].startedAt = millis();
  pendingScans[pendingIndex].active = true;
  showOLED("Camera pending", "Waiting for image");
}

static void pollPendingScans() {
  const unsigned long now = millis();
  for (uint8_t index = 0; index < MAX_PENDING_SCANS; ++index) {
    PendingScan &scan = pendingScans[index];
    if (scan.active && now - scan.startedAt >= RESULT_TIMEOUT_MS) {
      Serial.println(
        "Result polling timed out; attendance success was not confirmed."
      );
      showOLED("Verification", "Timed out");
      scan.active = false;
    }
  }

  if (
    WiFi.status() != WL_CONNECTED ||
    now - lastStatusPollAt < POLL_INTERVAL_MS
  ) {
    return;
  }

  for (uint8_t offset = 0; offset < MAX_PENDING_SCANS; ++offset) {
    const uint8_t index =
      (nextPendingScanIndex + offset) % MAX_PENDING_SCANS;
    PendingScan &scan = pendingScans[index];
    if (!scan.active) continue;

    lastStatusPollAt = now;
    nextPendingScanIndex = (index + 1) % MAX_PENDING_SCANS;
    bool finished = false;
    readResult(scan.scanId, scan.lastStatus, finished);
    if (finished) scan.active = false;
    return;
  }
}

void setup() {
  Serial.begin(115200);
  delay(500);

  Serial.println();
  Serial.println("RFID live face-verification reader");

  initOLED();
  showOLED("Smart Attendance", "Connecting Wi-Fi");

  connectToWiFi();

  SPI.begin(
    RFID_SCK_PIN,
    RFID_MISO_PIN,
    RFID_MOSI_PIN,
    RFID_SS_PIN
  );

  reader.PCD_Init();
  delay(100);

  byte version = reader.PCD_ReadRegister(MFRC522::VersionReg);

  Serial.print("RC522 version register: 0x");
  Serial.println(version, HEX);

  if (version == 0x00 || version == 0xFF) {
    readerReady = false;
    Serial.println("ERROR: RC522 communication failed!");
    Serial.println("Check 3.3V, GND, SS, RST and SPI wiring.");

    showOLED("RC522 error", "Check wiring");
  } else {
    readerReady = true;
    Serial.println("RC522 communication detected.");

    Serial.println(
      "RC522 ready. Present an enrolled student's card."
    );

    showOLED("RFID ready", "Waiting for card");
  }
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println(
      "Wi-Fi disconnected; attempting to reconnect."
    );

    showOLED("Wi-Fi disconnected", "Reconnecting...");

    if (!connectToWiFi()) {
      delay(2000);
      return;
    }

    showOLED("RFID ready", "Waiting for card");
  }

  if (!readerReady) {
    delay(1000);
    return;
  }

  pollPendingScans();

  String uid;
  bool cardReady = false;

  if (lastScannedUid.length() > 0) {
    byte atqa[2];
    byte atqaSize = sizeof(atqa);

    const MFRC522::StatusCode status =
      reader.PICC_WakeupA(atqa, &atqaSize);

    if (status == MFRC522::STATUS_TIMEOUT) {
      lastScannedUid = "";
    } else if (status != MFRC522::STATUS_OK) {
      delay(50);
      return;
    } else {
      if (!reader.PICC_ReadCardSerial()) {
        delay(50);
        return;
      }

      uid = uidToString(reader.uid);

      if (uid == lastScannedUid) {
        reader.PICC_HaltA();
        delay(100);
        return;
      }

      cardReady = true;
    }
  }

  if (!cardReady) {
    if (
      !reader.PICC_IsNewCardPresent() ||
      !reader.PICC_ReadCardSerial()
    ) {
      delay(50);
      return;
    }

    uid = uidToString(reader.uid);
  }

  reader.PICC_HaltA();
  reader.PCD_StopCrypto1();

  lastScannedUid = uid;
  processCard(uid);
}