# Smart Classroom RFID Attendance System

Smart Classroom RFID Attendance System with Camera-Based Face Verification and Subject-Wise Attendance Analytics.

## Final Architecture

The system uses RFID as the primary student identifier. The main ESP32 reads an RC522 RFID card and sends the identified RFID UID to the backend. The ESP32-CAM captures a face image, and backend-side face verification compares that image against the registered face reference for the RFID-identified student. This is 1:1 verification, not 1:N face identification.

The planned system includes:

- **RFID and ESP32:** identify the student through the RC522 reader and classroom hardware.
- **ESP32-CAM:** capture the face image for secondary identity verification.
- **Backend:** coordinate verification, timetable/session decisions, attendance events, records, and live updates.
- **Face Verification:** verify the captured face against the RFID-identified student's registered face reference.
- **Timetable:** connect a class, subject, teacher, day, start time, and end time.
- **Attendance Session:** represent one actual class attendance session for a timetable slot.
- **Attendance Events:** store verified `ENTRY` and `EXIT` movements without duration fields.
- **Attendance Records:** store the student's live state and finalized session result.
- **MongoDB:** planned persistence layer for users, students, teachers, subjects, classes, timetables, sessions, events, records, and face references.
- **React Dashboard:** Phase 4 frontend for live attendance registers, timetable management, dashboards, and subject-wise analytics.

Phase 5 adds the enrollment-ready foundation: setup CRUD for classes, subjects, teachers, and students; a Setup Center; safe face-reference status endpoints; and a face-verification service boundary. The current face provider is intentionally disabled until a real verification engine is connected.

Phase 6 adds a real local WASM face engine using `@vladmandic/face-api` and TensorFlow.js WASM. It loads face detection, landmarks, and recognition weights, generates 128-dimensional descriptors, and computes Euclidean distance for 1:1 comparison against only the RFID-identified student's reference. Threshold calibration is intentionally pending, so verification returns `THRESHOLD_NOT_CONFIGURED` until a calibrated value is supplied.

## Attendance Flow

```text
RFID scan
	-> ESP32 identifies RFID UID
	-> Backend identifies the student
	-> ESP32-CAM captures face
	-> Backend performs 1:1 face verification
	-> Active timetable/session is checked
	-> Current state determines ENTRY or EXIT
	-> Attendance event and live state are updated
	-> Session close finalizes attendance status
```

Invalid RFID or failed face verification rejects the scan without creating an event or changing state.

## Live State and Final Status

During an active session, each student has one live state:

```text
NOT_SCANNED -> IN_CLASS -> OUTSIDE -> IN_CLASS
```

Every transition requires valid RFID and face verification. At session close:

- `IN_CLASS` becomes `PRESENT`.
- `OUTSIDE` becomes `LEFT_EARLY`.
- `NOT_SCANNED` becomes `ABSENT`.

`LEFT_EARLY` and `ABSENT` do not count as present. Time spent in class is not tracked.

## Subject-Wise Attendance

Attendance is calculated independently for every subject assigned to the student's class:

```text
attendancePercentage =
(PRESENT completed sessions / total completed sessions) * 100
```

The percentage is derived from attendance records rather than stored as a permanent hardcoded value. The current timetable subject determines the subject percentage shown in the live attendance view.

## Frontend Dashboard

The React/Vite dashboard lives in `frontend/` and uses `VITE_API_BASE_URL` for all backend calls. Implemented views include:

- Admin command center and timetable management.
- Teacher session start, live attendance with four-second polling, close attendance, register, and subject reports.
- Student attendance, history, and a profile placeholder.
- Development-only role selection on the login page. Production authentication is not implemented.

Student, teacher, subject, and class management pages use the Phase 5 CRUD APIs.

## Enrollment and Face Verification Foundation

The intended setup flow is:

```text
Setup Center -> Classes -> Subjects -> Teachers -> Students -> RFID -> Face -> Timetable -> Review
```

RFID remains the primary identifier. Face verification is always scoped to the RFID-identified student and is never a 1:N search. The backend exposes `/api/face-references/status` and `/api/face-references`, but does not create a face reference while no provider is configured. Raw biometric data is not returned by normal reads.

For development-only testing, set `FACE_VERIFICATION_MODE=development` in the local ignored `backend/.env`. This accepts an explicit test boolean at the backend boundary and labels the result as development-only; it performs no biometric comparison and must not be treated as production verification. The example configuration defaults to `disabled`.

The Phase 6 endpoints are:

- `POST /api/face-verification/enroll` with multipart `studentId` and `image`.
- `POST /api/face-verification/verify` with multipart `studentId` and `image`.
- `GET /api/face-verification/status`.

The provider uses Euclidean descriptor distance, where lower distance indicates a closer match. The future calibration step must use representative single-face enrollment, same-person, and different-person samples. Raw images are held in memory for processing and are not stored by the transport layer.

Phase 5 adds `/api/students`, `/api/teachers`, `/api/subjects`, and `/api/classes` CRUD endpoints. Dependent records cannot be deleted when attendance, timetable, or face-reference relationships exist; deactivate them instead where supported.

## Current Phase

Phases 1 through 5 and the Phase 6 WASM engine integration are implemented. Threshold calibration, authentication, hardware communication, notifications, and deployment remain future work.

See [docs/architecture/ARCHITECTURE.md](docs/architecture/ARCHITECTURE.md), [docs/database/DATABASE_DESIGN.md](docs/database/DATABASE_DESIGN.md), and [docs/api/API_FOUNDATION.md](docs/api/API_FOUNDATION.md) for the documented design.
