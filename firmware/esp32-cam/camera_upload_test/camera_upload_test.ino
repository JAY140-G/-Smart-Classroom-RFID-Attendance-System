#include "esp_camera.h"
#include <HTTPClient.h>
#include <WiFi.h>
#include "camera_test_config.h"

const unsigned long WIFI_CONNECT_TIMEOUT_MS = 30000;
const unsigned long HTTP_TIMEOUT_MS = 15000;

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
  config.frame_size = FRAMESIZE_VGA;
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

  
  sensor->set_whitebal(sensor, 1);sensor->set_framesize(sensor, FRAMESIZE_VGA);
  sensor->set_quality(sensor, 12);
  sensor->set_awb_gain(sensor, 1);
  sensor->set_exposure_ctrl(sensor, 1);
  sensor->set_gain_ctrl(sensor, 1);
  Serial.printf("Camera initialized; sensor PID: 0x%04x\n", sensor->id.PID);
  Serial.println("Configured for JPEG, SVGA 800x600, quality 10, XCLK 20 MHz.");
  return true;
}

static bool connectToWiFi() {
  Serial.printf("Connecting to Wi-Fi SSID: %s\n", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  const unsigned long startedAt = millis();
  while (WiFi.status() != WL_CONNECTED
      && millis() - startedAt < WIFI_CONNECT_TIMEOUT_MS) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Wi-Fi connection failed. Check the SSID, password, and 2.4 GHz access point.");
    return false;
  }

  Serial.print("Wi-Fi connected. ESP32-CAM IP: ");
  Serial.println(WiFi.localIP());
  return true;
}

static void captureAndPostJpeg() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Wi-Fi is disconnected; image upload skipped.");
    return;
  }

  Serial.println("Capturing JPEG frame...");
  camera_fb_t *frame = esp_camera_fb_get();
  if (frame == nullptr) {
    Serial.println("Camera capture failed: no frame buffer returned.");
    return;
  }

  Serial.printf("Captured %u bytes, format=%s\n",
      static_cast<unsigned int>(frame->len),
      frame->format == PIXFORMAT_JPEG ? "JPEG" : "not JPEG");
  if (frame->format != PIXFORMAT_JPEG || frame->len == 0) {
    Serial.println("Camera did not return a usable JPEG frame.");
    esp_camera_fb_return(frame);
    return;
  }

  WiFiClient client;
  HTTPClient http;
  http.setTimeout(HTTP_TIMEOUT_MS);
  if (!http.begin(client, BACKEND_IMAGE_URL)) {
    Serial.println("HTTP setup failed; could not open the backend URL.");
    esp_camera_fb_return(frame);
    return;
  }

  http.addHeader("Content-Type", "image/jpeg");
  http.addHeader("X-Camera-Test-Key", CAMERA_TEST_KEY);
  const int statusCode = http.POST(frame->buf, frame->len);
  esp_camera_fb_return(frame);

  if (statusCode == 200) {
    Serial.println("Camera-test JPEG accepted; this is not a face-verification result.");
  } else if (statusCode > 0) {
    Serial.printf("Camera-test upload rejected (HTTP %d).\n", statusCode);
  } else {
    Serial.printf("HTTP upload failed: %s (%d)\n",
        HTTPClient::errorToString(statusCode).c_str(),
        statusCode);
  }

  http.end();
}

void setup() {
  Serial.begin(115200);
  Serial.setDebugOutput(false);
  delay(500);
  Serial.println();
  Serial.println("ESP32-CAM JPEG backend upload test");

  if (!initializeCamera()) {
    Serial.println("Stopping: camera initialization failed.");
    return;
  }
  if (!connectToWiFi()) {
    Serial.println("Stopping: Wi-Fi is unavailable.");
    return;
  }

  captureAndPostJpeg();
  Serial.println("Test finished. Reset the board to send another frame.");
}

void loop() {
  delay(1000);
}
