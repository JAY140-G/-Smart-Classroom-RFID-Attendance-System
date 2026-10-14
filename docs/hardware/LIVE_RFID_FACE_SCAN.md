# Live RFID + ESP32-CAM face verification

This guide runs the two-board scan flow. The ESP32 DevKit reads the RC522 UID and opens a short-lived backend scan request. The ESP32-CAM independently polls the backend, captures a new JPEG for the opaque scan ID, and uploads it. The backend resolves the RFID student and calls its real `verifyFace()` implementation against that student's active enrolled `FaceReference`; only a match reaches the existing attendance state machine. The camera-test endpoint is not involved.

The backend and both boards must be on a trusted, isolated classroom LAN. The sketches use HTTP for local development; do not port-forward the backend, use an untrusted Wi-Fi network, or deploy the shared device key over public HTTP. Use a protected HTTPS deployment for production.

## Backend prerequisites

Configure `backend/.env` (or the backend process environment) with:

- `MONGODB_URI` connected to a MongoDB replica set that supports transactions.
- `AUTH_DEVICE_KEY` as a random secret of at least 32 characters. The same value is placed locally in both board sketches; keep it out of source control.
- `FACE_ENGINE=wasm` and the face model/runtime dependencies.
- A deliberately calibrated `FACE_MATCH_THRESHOLD`. Verification fails closed when the threshold is missing.
- Optional `LIVE_SCAN_IMAGE_RETENTION_MINUTES` from `1` to `60` (default `10`). Captured images are stored only for this interval and expire through a MongoDB TTL index.

Ensure the enrolled student is active, the RFID UID is registered as 8, 14, or 20 hexadecimal characters without separators (4, 7, or 10 bytes), that student's active face reference exists, and an active attendance session exists for the student's class. Physical RFID UIDs and virtual UIDs are stored separately. Duplicate student roll numbers and physical UIDs are rejected by their unique indexes. Do not use real student identities or face images for test runs.

The backend must receive `AUTH_DEVICE_KEY` in its process environment (or `backend/.env`) before it starts. If it is missing or shorter than 32 characters, live-scan routes return `503` with `Attendance device authentication is not configured`; if a supplied board key does not match, they return `401`. These failures happen before MongoDB access. The server logs the route template, error type/status, and stack frames for server errors, but never logs request headers or bodies.

The separate [camera_upload_test.ino](../../firmware/esp32-cam/camera_upload_test/camera_upload_test.ino) sketch posts one JPEG to `/api/camera-test/image` using its local `camera_test_config.h` and the backend's `CAMERA_TEST_KEY` (not `AUTH_DEVICE_KEY`). Copy [camera_test_config.example.h](../../firmware/esp32-cam/camera_upload_test/camera_test_config.example.h) to `camera_test_config.h` only if you need that isolated test. An HTTP 200 from this endpoint confirms only that a test JPEG was received; it does not identify a student, verify a face, or mark attendance. Use the `live_scan` camera sketch for the real flow.

Before deployment, ensure MongoDB has created the `LiveScanRequest` unique indexes (`scanId`, `idempotencyKey`), the `{ status, createdAt }` queue index, and the TTL index on `purgeAt`; ensure `LiveScanImage` has its unique `scanId` index and TTL index on `expiresAt`, as well as the existing unique attendance-receipt index. MongoDB TTL deletion may be asynchronous; the API independently checks each capture deadline and image-expiry timestamp.

From PowerShell, run the backend tests and start the server in separate terminals:

```powershell
Set-Location E:\Smart\SMART_CLASSROOM_ATTENDANCE\backend
npm test
```

```powershell
Set-Location E:\Smart\SMART_CLASSROOM_ATTENDANCE\backend
npm start
```

The default port is `5000`. Find the backend PC's LAN IPv4 address with:

```powershell
ipconfig
```

Use that IPv4 address in both sketches; do not use `localhost` or `127.0.0.1`. Permit Node.js through Windows Defender Firewall on the trusted Private network only. Disable client isolation on the access point so both ESP32 boards can reach the PC.

## RC522 wiring to an ESP32 DevKit

Use 3.3 V logic and power. Do not connect the RC522 to 5 V.

| RC522 pin | ESP32 DevKit pin |
| --- | --- |
| SDA / SS | GPIO 21 |
| SCK | GPIO 18 |
| MOSI | GPIO 23 |
| MISO | GPIO 19 |
| RST | GPIO 22 |
| 3.3V | 3V3 |
| GND | GND |
| IRQ | Not connected |

The sketch uses the standard VSPI pins and explicitly selects GPIO 21/22 for SS/RST. Keep the RC522 wires short and share a common ground.

The DevKit sketch is configured for an Adafruit SSD1306 128x64 I2C OLED at address `0x3C`:

| OLED pin | ESP32 DevKit pin |
| --- | --- |
| SDA | GPIO 25 |
| SCL | GPIO 26 |
| VCC | 3.3V (confirm the module supports this supply) |
| GND | GND |

The firmware configuration and earlier initialization output identify the expected display interface/address, but do not identify the physical OLED controller by inspection. Confirm that the module is SSD1306 128x64 before relying on the display; do not change wiring to 5V.

## Configure and upload both sketches

Install the Arduino IDE ESP32 board package (**esp32 by Espressif Systems**) and the **MFRC522** and **ArduinoJson** libraries from Library Manager.

Each live-scan sketch includes a local `live_scan_config.h`, which is ignored by Git. Copy the matching `live_scan_config.example.h` if the local file does not exist, then fill in the 2.4 GHz Wi-Fi SSID/password and copy the same `AUTH_DEVICE_KEY` from `backend/.env` into both headers. Set `BACKEND_BASE_URL` to the backend PC's current LAN address and port. Never commit the real local headers.

1. Open [rfid_live_scan.ino](../../firmware/esp32-devkit/rfid_live_scan/rfid_live_scan.ino). Select **ESP32 Dev Module** and the correct serial port. The values are loaded from its ignored `live_scan_config.h`; do not add credentials to the sketch.
2. Optionally set `SESSION_ID` to the active attendance session ObjectId; leave it empty to use the backend's active-session lookup.
3. Compile and upload. Open Serial Monitor at `115200` baud.
4. Open [live_scan.ino](../../firmware/esp32-cam/live_scan/live_scan.ino). Select **AI Thinker ESP32-CAM**, enable PSRAM where available, and select its serial port.
5. The camera sketch loads the same local Wi-Fi, backend URL, and attendance device key from its ignored `live_scan_config.h`. Compile and upload; use the USB base-board's GPIO0/BOOT upload procedure if required, then reset into run mode.
6. Start an active attendance session. In the DevKit Serial Monitor, present a registered card once and face the camera. Keep the face clearly visible and alone in the frame.

The DevKit waits for a terminal result. The camera polls for pending opaque scan IDs and captures only after receiving one. A capture challenge expires after 30 seconds; its status/result is retained for up to ten minutes. A mismatch, no/multiple face, missing reference, invalid image, unknown RFID, inactive/missing session, expired capture request, or unavailable face service is a rejection and must not mark attendance. Use a new physical scan (new UUID idempotency key generated by firmware) after a rejected request.

### Virtual RFID software test

For software integration while the RC522 is unavailable, sign in to the existing frontend as an administrator and open **Virtual RFID console**. The page lists active MongoDB students and assigns a deterministic virtual value `V-<uppercase student ObjectId>` into the separate sparse-unique `Student.virtualRfidUid` field. The real `rfidUid` is not modified. Select a student with an active face enrollment and press **Scan Virtual Card**. The console creates an admin-authenticated, UUID-idempotent challenge; the ESP32-CAM must still poll the authenticated camera queue, capture a fresh JPEG, and submit it. The backend then performs its real face comparison and the shared attendance transition. No local file upload, selected-student flag, or UI action can approve the face.

This software mode is visibly labelled virtual and audit events carry `source: "VIRTUAL"`. The recent-scan table reads stored challenge records for both physical and virtual scans. If the camera is not online, the request expires; a mismatch, missing reference, invalid image, service failure, or invalid session cannot change attendance. The UI reports `ENTRY`/`EXIT` and the live movement state; final `PRESENT`/`LEFT_EARLY`/`ABSENT` remains controlled by the existing session-close logic. The API status object uses `protocolVersion: 1` with real states `WAITING_CAMERA`, `PROCESSING`, `SUCCEEDED`, `FAILED`, and `EXPIRED`; the DevKit OLED reports scan states and displays success only after the backend confirms `SUCCEEDED`. Face matching is not liveness/anti-spoofing.

This mode requires MongoDB connectivity, the existing student and active face-reference data, `AUTH_DEVICE_KEY`, the running backend, and the live-scan ESP32-CAM firmware. It does not depend on RC522 communication. No student or face reference is created by opening the console.

The DevKit suppresses the currently presented card UID until the RC522 reports that the card has been removed. Lift the card from the reader before presenting it again for the next movement; each separate presentation gets its own idempotency key.

The DevKit does not print the RFID UID, device key, raw response body, face image, or embedding. After the backend resolves the UID, the OLED and serial monitor show the student's name and scan progress; names are sent only to the device-authenticated DevKit, not to the camera queue. Expected messages include `RFID card detected`, `Student resolved`, `Pending: waiting for a fresh camera capture`, `Camera image received; verifying face`, and, only after the backend reaches `SUCCEEDED`, `Face matched; attendance marked`. Mismatch, no face, multiple faces, missing enrollment/session, camera timeout, service failure, or network errors have separate rejection messages and do not indicate attendance success.

An administrator can view a retained camera capture in the **Virtual RFID console → Recent physical and virtual scans** table. Select **View** only when the row says the image is retained. The image endpoint requires an administrator login, returns `image/jpeg` with `Cache-Control: no-store`, never changes attendance, and returns 404 when the image is absent or expired. The browser requests the image using the administrator's existing bearer session; it is not exposed through an unauthenticated URL. Images are stored in MongoDB separately from scan records and removed by the TTL index. Restrict administrator access and use a trusted LAN; local firmware transport uses HTTP.

### Correct an existing test student's RFID registration

At the last local database inspection, JAY's stored RFID value did not have the hexadecimal UID shape emitted by the RC522, although the existing face reference was active. Recheck those records before testing because database contents can change. Do not replace the face enrollment. In Arduino IDE, use **File → Examples → MFRC522 → DumpInfo** with the DevKit/RC522 wiring above to read the physical card's UID in the local Serial Monitor. Keep that UID private. In the admin dashboard's **Students** page, edit the existing JAY record and replace only its physical RFID UID with the reader's hex value without separators (4/7/10 bytes = 8/14/20 hex characters). Save the existing student; do not create a duplicate.

At the last local database inspection, no active timetable or attendance session existed for JAY's class. Recheck the current session first. Use the existing admin timetable setup to select the intended class, subject, assigned teacher, actual day/time, and room; then use **Start attendance** for that timetable slot. Do not invent a timetable slot just for this test.

## API smoke test (without boards)

Run from PowerShell with the backend reachable at the LAN URL. Set `$env:AUTH_DEVICE_KEY` to the same local backend device key and replace the registered UID. Use a new UUID for every physical test request:

```powershell
$base = 'http://<PC-LAN-IPv4>:5000'
$headers = @{
  'X-Attendance-Device-Key' = $env:AUTH_DEVICE_KEY
  'Idempotency-Key' = '123e4567-e89b-42d3-a456-426614174000'
}
$body = @{ rfidUid = '<REGISTERED_HEX_UID>' } | ConvertTo-Json
$scan = Invoke-RestMethod -Method Post -Uri "$base/api/attendance/live-scans" -Headers $headers -ContentType 'application/json' -Body $body
$scanId = $scan.data.scanId
Invoke-RestMethod -Method Get -Uri "$base/api/attendance/live-scans/next" -Headers @{ 'X-Attendance-Device-Key' = $env:AUTH_DEVICE_KEY }
```

Submit an approved test JPEG captured for this request while its 30-second capture window is open. Do not commit or share the image:

```powershell
curl.exe --fail-with-body -i -X POST "$base/api/attendance/live-scans/$scanId/image" `
  -H "X-Attendance-Device-Key: $env:AUTH_DEVICE_KEY" `
  -H 'Content-Type: image/jpeg' `
  --data-binary '@C:\path\to\approved-test-face.jpg'
Invoke-RestMethod -Method Get -Uri "$base/api/attendance/live-scans/$scanId" -Headers @{ 'X-Attendance-Device-Key' = $env:AUTH_DEVICE_KEY }
```

For an actual hardware run, let both uploaded boards perform their own polling and upload; do not manually upload the same scan challenge. A `SUCCEEDED` result exposes only movement type/state. Verify the matching event/state in the existing dashboard. Repeat with a different student/test image and confirm the backend reports failure with no state transition.

## What these checks do not prove

`npm test` covers the database-free live-scan service behavior and the existing attendance state machine. The PowerShell commands exercise the backend protocol only when a live MongoDB replica set, configured face engine/models, calibrated threshold, enrolled test reference, active session, and approved test image are available. No software test substitutes for uploading both sketches, checking actual wiring, checking LAN/firewall reachability, calibrating the face threshold with consented test subjects, or verifying physical RFID/camera operation. Hardware/end-to-end verification must be reported only after those manual steps complete.
