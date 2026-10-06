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
- **MongoDB:** Mongoose persistence for users, students, teachers, subjects, classes, timetables, sessions, events, records, face references, auth sessions, and scan receipts.
- **React Dashboard:** role-aware Admin, Teacher, and Student dashboards, setup workflows, reports, attendance registers, timetable management, and subject-wise analytics.

Phase 5 added setup CRUD for classes, subjects, teachers, and students; a Setup Center; and face enrollment/status workflows. Phase 6 connected a local WASM face-verification engine. Acceptance remains fail-closed until a calibrated threshold is configured.

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

## Frontend Dashboard and Authentication

The React/Vite frontend lives in `frontend/` and uses `VITE_API_BASE_URL` for backend calls. Login uses authenticated server sessions and routes users according to their backend role. Backend authorization protects setup, timetable, attendance, and student-specific endpoints; frontend route guards are supplementary and are not the security boundary.

- Admin command center, setup CRUD, timetable management, session controls, live attendance, and reports.
- Teacher dashboard, assigned timetable/session controls, live attendance, register, and subject reports.
- Student dashboard, own attendance summary/history, and own class timetable.
- Attendance reports include date/class/subject/status filters and a safely escaped CSV export.
- Dashboard attendance percentages come from backend completed records. `PRESENT` contributes to the numerator, `ABSENT` and `LEFT_EARLY` remain in the denominator, active sessions are excluded, and no completed data is represented as unavailable rather than `0%`.

## Enrollment and Face Verification Foundation

The intended setup flow is:

```text
Setup Center -> Classes -> Subjects -> Teachers -> Students -> RFID -> Face -> Timetable -> Review
```

RFID remains the primary identifier. Face verification is always scoped to the RFID-identified student and is never a 1:N search. The backend exposes `/api/face-references/status` and `/api/face-references`, but does not create a face reference while no provider is configured. Raw biometric data is not returned by normal reads.

For isolated development testing, `FACE_VERIFICATION_MODE=development` accepts an explicit test boolean at the backend boundary; it performs no biometric comparison and must never be treated as production verification. Production attendance scans use the WASM verification path and fail closed unless a threshold has been configured.

The Phase 6 endpoints are:

- `POST /api/face-verification/enroll` with multipart `studentId` and `image`.
- `POST /api/face-verification/verify` with multipart `studentId` and `image`.
- `GET /api/face-verification/status`.

The provider uses Euclidean descriptor distance, where lower distance indicates a closer match. The future calibration step must use representative single-face enrollment, same-person, and different-person samples. Raw images are held in memory for processing and are not stored by the transport layer.

Phase 5 adds `/api/students`, `/api/teachers`, `/api/subjects`, and `/api/classes` CRUD endpoints. Dependent records cannot be deleted when attendance, timetable, or face-reference relationships exist; deactivate them instead where supported.

## Current Phase

The backend attendance workflow, transactional scan/session-close writes, scan idempotency, authentication and role authorization, setup CRUD, timetable validation, face-verification APIs, and role-aware dashboards/reports are implemented. Automated backend and frontend tests are database-free; they do not establish live MongoDB transaction behavior or deployment readiness.

Remaining milestones include representative face-threshold calibration, paginated reporting for larger datasets, deployment hardening, firmware and hardware integration, live Atlas/API validation, and an end-to-end attendance test with provisioned test identities and face references. RC522 hardware/cards and firmware are not available/implemented; physical attendance scans have not been validated.

See [docs/architecture/ARCHITECTURE.md](docs/architecture/ARCHITECTURE.md), [docs/database/DATABASE_DESIGN.md](docs/database/DATABASE_DESIGN.md), and [docs/api/API_FOUNDATION.md](docs/api/API_FOUNDATION.md) for the documented design.

For the first local ESP32-CAM JPEG-to-backend connectivity check, follow [the hardware upload test guide](docs/hardware/ESP32_CAM_BACKEND_TEST.md). This is a camera transport test only; it does not perform face recognition or attendance processing.
