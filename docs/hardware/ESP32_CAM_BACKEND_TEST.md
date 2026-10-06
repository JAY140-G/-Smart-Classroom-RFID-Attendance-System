# ESP32-CAM to Backend JPEG Test

This first communication test sends one JPEG frame from the AI Thinker ESP32-CAM to a dedicated backend endpoint. The endpoint checks that the raw request body has JPEG start/end markers and returns its byte count. It does not run face recognition, read RFID, access MongoDB, or create attendance data.

The test endpoint is protected by a separate `CAMERA_TEST_KEY`. Do not reuse `AUTH_DEVICE_KEY` or an administrator bearer token. The test key is embedded in the uploaded sketch, so use a temporary random value of at least 32 characters, keep the sketch local, and rotate/remove the key after testing.

## 1. Configure the backend

Add a fresh value for `CAMERA_TEST_KEY` to the ignored `backend/.env` file, or set it in the backend process environment. Use at least 32 random characters. Do not copy a real secret into project documentation or commit it.

The endpoint has a fixed 5 MB maximum body size. This test requires no face engine, face threshold, RFID UID, attendance session, database records, or MongoDB connection.

From PowerShell, start the backend:

```powershell
Set-Location E:\Smart\SMART_CLASSROOM_ATTENDANCE\backend
npm start
```

The backend listens on port `5000` by default and binds to network interfaces. If Windows Defender Firewall prompts, allow Node.js on the trusted Private network only. Do not expose this unauthenticated network boundary to the public internet; the route itself requires the dedicated camera test key.

## 2. Find the PC's LAN IPv4 address

On Windows, run:

```powershell
ipconfig
```

Find the IPv4 address for the active Wi-Fi or Ethernet adapter on the same LAN as the ESP32-CAM. Do not use `127.0.0.1` or `localhost` in the board URL: those addresses refer to the ESP32-CAM itself. If the PC's LAN address changes, update the sketch URL before uploading again.

## 3. Configure and upload the sketch

Open [camera_upload_test.ino](../../firmware/esp32-cam/camera_upload_test/camera_upload_test.ino) in Arduino IDE.

Install/select:

- Board package: **esp32 by Espressif Systems**
- Board: **AI Thinker ESP32-CAM**
- PSRAM: **Enabled**, if the installed board menu exposes this option
- Serial Monitor: **115200 baud**

The sketch uses only libraries supplied with the ESP32 board package: `esp_camera.h`, `WiFi.h`, and `HTTPClient.h`. There are no third-party Arduino libraries to install.

Before compiling, replace these sketch placeholders with local values:

| Sketch constant | Configure it to |
| --- | --- |
| `WIFI_SSID` | The 2.4 GHz Wi-Fi network name the ESP32-CAM can join |
| `WIFI_PASSWORD` | The matching Wi-Fi password |
| `BACKEND_IMAGE_URL` | `http://<PC-LAN-IPv4>:5000/api/camera-test/image` |
| `CAMERA_TEST_KEY` | The same temporary value configured as backend `CAMERA_TEST_KEY` |

Use the PC's current LAN IPv4 address in place of `<PC-LAN-IPv4>`. This first test uses plain HTTP on the local network; do not forward the backend port to the internet. Keep the configured sketch local and do not commit real Wi-Fi credentials or the test key.

Connect the ESP32-CAM using its USB base board, select its serial port, compile, and upload. If upload mode is needed, follow the board/base-board instructions for GPIO0/BOOT, then reset the board into run mode after upload.

## 4. Run the first upload

Open Serial Monitor at `115200` baud and reset the board. On startup, the sketch initializes the AI Thinker camera pin map, requests JPEG at SVGA 800x600 with quality 10 and 20 MHz XCLK, connects to Wi-Fi, captures one frame, and posts the raw JPEG body with `Content-Type: image/jpeg`.

Successful output should resemble:

```text
ESP32-CAM JPEG backend upload test
Camera initialized; sensor PID: 0x....
Configured for JPEG, SVGA 800x600, quality 10, XCLK 20 MHz.
Connecting to Wi-Fi SSID: <your network name>
Wi-Fi connected. ESP32-CAM IP: <board LAN address>
Capturing JPEG frame...
Captured <byte count> bytes, format=JPEG
Posting JPEG to http://<PC-LAN-IPv4>:5000/api/camera-test/image
Backend HTTP status: 200
Backend response: {"success":true,"message":"Camera test image received","data":{"received":true,"contentType":"image/jpeg","sizeBytes":<byte count>}}
Test finished. Reset the board to send another frame.
```

The firmware also reports camera capture, Wi-Fi, HTTP setup, and HTTP request errors. The frame buffer is returned on all post-capture paths. Reset the board to send a new test frame; it does not continuously upload images.

## Endpoint

```http
POST /api/camera-test/image
Content-Type: image/jpeg
X-Camera-Test-Key: <temporary camera test key>

<raw JPEG bytes>
```

Responses:

- `200`: JPEG body received; JSON includes `received`, `contentType`, and `sizeBytes`.
- `400`: missing/empty, malformed/incomplete JPEG, or a content type other than `image/jpeg`.
- `401`: missing or incorrect camera test key.
- `413`: body exceeds the fixed 5 MB limit.
- `503`: `CAMERA_TEST_KEY` is unset or shorter than 32 characters.

The request is held in memory for validation and is not saved to disk. The route does not call attendance services or persist any records. Backend route tests exercise this endpoint locally, but do not replace the manual ESP32-CAM test above.
