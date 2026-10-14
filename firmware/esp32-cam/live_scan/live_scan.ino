#include "esp_camera.h"
#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <WiFi.h>
#include "live_scan_config.h"

const unsigned long WIFI_CONNECT_TIMEOUT_MS = 30000;
const unsigned long CAMERA_POLL_INTERVAL_MS = 750;
const uint16_t REQUEST_TIMEOUT_MS = 60000;
bool cameraReady = false;

static camera_config_t cameraConfig() {
  camera_config_t config = {};
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer = LEDC_TIMER_0;
  config.pin_d0 = 5;
  config.pin_d1 = 18;
  config.pin_d2 = 19;
  config.pin_d3 = 21;
  config.pin_d4 = 36;
  config.pin_d5 = 39;
  config.pin_d6 = 34;
  config.pin_d7 = 35;
  config.pin_xclk = 0;
  config.pin_pclk = 22;
  config.pin_vsync = 25;
  config.pin_href = 23;
  config.pin_sccb_sda = 26;
  config.pin_sccb_scl = 27;
  config.pin_pwdn = 32;
  config.pin_reset = -1;
  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_JPEG;
  config.frame_size = FRAMESIZE_SVGA;
  config.jpeg_quality = 10;
  config.fb_count = psramFound() ? 2 : 1;
  config.fb_location = psramFound() ? CAMERA_FB_IN_PSRAM : CAMERA_FB_IN_DRAM;
  config.grab_mode = CAMERA_GRAB_LATEST;
  return config;
}

static bool initializeCamera() {
  camera_config_t config = cameraConfig();
  const esp_err_t result = esp_camera_init(&config);
  if (result != ESP_OK) {
    Serial.printf("Camera initialization failed: 0x%x\n", result);
    return false;
  }
  sensor_t *sensor = esp_camera_sensor_get();
  if (sensor == nullptr) {
    Serial.println("Camera sensor configuration unavailable.");
    return false;
  }
  sensor->set_framesize(sensor, FRAMESIZE_SVGA);
  sensor->set_quality(sensor, 10);
  sensor->set_whitebal(sensor, 1);
  sensor->set_awb_gain(sensor, 1);
  sensor->set_exposure_ctrl(sensor, 1);
  sensor->set_gain_ctrl(sensor, 1);
  Serial.printf("Camera ready; sensor PID: 0x%04x\n", sensor->id.PID);
  return true;
}

static bool connectToWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  const unsigned long startedAt = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - startedAt < WIFI_CONNECT_TIMEOUT_MS) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Wi-Fi connection failed.");
    return false;
  }
  Serial.print("Wi-Fi connected; ESP32-CAM IP: ");
  Serial.println(WiFi.localIP());
  return true;
}

static void addDeviceHeader(HTTPClient &http) {
  http.addHeader("X-Attendance-Device-Key", ATTENDANCE_DEVICE_KEY);
}

static bool getPendingScan(String &scanId) {
  WiFiClient client;
  HTTPClient http;
  http.setTimeout(8000);
  if (!http.begin(client, String(BACKEND_BASE_URL) + "/api/attendance/live-scans/next")) {
    return false;
  }
  addDeviceHeader(http);
  const int code = http.GET();
  String response;
  if (code > 0) response = http.getString();
  http.end();
  if (code != 200) {
    if (code == 401) Serial.println("Device authentication failed; check local key configuration.");
    else if (code == 503) Serial.println("Backend attendance-device authentication is not configured.");
    else if (code > 0) Serial.printf("Camera queue returned HTTP %d.\n", code);
    else Serial.printf("Camera queue network request failed (%d).\n", code);
    return false;
  }

  DynamicJsonDocument document(512);
  if (deserializeJson(document, response) != DeserializationError::Ok) {
    Serial.println("Camera queue returned invalid JSON.");
    return false;
  }
  scanId = document["data"]["scanId"].as<String>();
  return scanId.length() == 36;
}

static bool captureAndUpload(const String &scanId) {
  if (WiFi.status() != WL_CONNECTED) return false;
  camera_fb_t *frame = esp_camera_fb_get();
  if (frame == nullptr) {
    Serial.println("Camera buffer could not be refreshed.");
    return false;
  }
  esp_camera_fb_return(frame);
  delay(200);
  frame = esp_camera_fb_get();
  if (frame == nullptr) {
    Serial.println("Fresh camera capture failed.");
    return false;
  }

  if (frame->format != PIXFORMAT_JPEG || frame->len < 4
      || frame->buf[0] != 0xff || frame->buf[1] != 0xd8
      || frame->buf[frame->len - 2] != 0xff || frame->buf[frame->len - 1] != 0xd9) {
    Serial.println("Camera did not return a complete JPEG.");
    esp_camera_fb_return(frame);
    return false;
  }

  WiFiClient client;
  HTTPClient http;
  http.setTimeout(REQUEST_TIMEOUT_MS);
  const String url = String(BACKEND_BASE_URL) + "/api/attendance/live-scans/" + scanId + "/image";
  if (!http.begin(client, url)) {
    Serial.println("Could not open the live image upload URL.");
    esp_camera_fb_return(frame);
    return false;
  }
  http.addHeader("Content-Type", "image/jpeg");
  addDeviceHeader(http);
  const unsigned int imageBytes = frame->len;
  const int code = http.POST(frame->buf, frame->len);
  esp_camera_fb_return(frame);
  http.end();

  if (code == 200) {
    Serial.printf("Fresh JPEG submitted for verification (%u bytes); waiting for scan result.\n", imageBytes);
    return true;
  }
  if (code == 401) Serial.println("Image upload authentication failed.");
  else if (code == 413) Serial.println("Captured image exceeds the backend upload limit.");
  else if (code == 404 || code == 409) Serial.println("Scan request expired or was already claimed; no retry was sent.");
  else if (code > 0) Serial.printf("Image upload returned HTTP %d.\n", code);
  else Serial.printf("Image upload failed (%d).\n", code);
  return false;
}

void setup() {
  Serial.begin(115200);
  Serial.setDebugOutput(false);
  delay(500);
  Serial.println();
  Serial.println("ESP32-CAM live face-verification capture");
  cameraReady = initializeCamera();
  if (!cameraReady) return;
  if (!connectToWiFi()) return;
}

void loop() {
  if (!cameraReady) {
    delay(2000);
    return;
  }
  if (WiFi.status() != WL_CONNECTED) {
    if (!connectToWiFi()) {
      delay(2000);
      return;
    }
  }

  String scanId;
  if (getPendingScan(scanId)) {
    Serial.println("Capture requested by backend.");
    captureAndUpload(scanId);
  }
  delay(CAMERA_POLL_INTERVAL_MS);
}
