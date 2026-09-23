# API Architecture Foundation

## Status

Phases 3 and 4 implement the timetable and attendance business endpoints below plus the connected React dashboard. Authentication, physical hardware communication, and actual face verification remain future work. `faceVerified` is supplied by the caller as the future verification result.

Phase 5 adds setup CRUD and Phase 6 adds a real local WASM face-verification engine plus multipart transport. The engine is selected with `FACE_ENGINE=wasm`; threshold acceptance remains disabled until `FACE_MATCH_THRESHOLD` is calibrated.

## Setup and Face Endpoints

| Method | Endpoint | Purpose | Status |
| --- | --- | --- | --- |
| `GET` | `/api/classes` | List classes | IMPLEMENTED |
| `GET` | `/api/classes/:id` | Read one class | IMPLEMENTED |
| `POST` | `/api/classes` | Create a class | IMPLEMENTED |
| `PUT` | `/api/classes/:id` | Update a class | IMPLEMENTED |
| `DELETE` | `/api/classes/:id` | Delete an unused class | IMPLEMENTED |
| `GET` | `/api/subjects` | List subjects | IMPLEMENTED |
| `POST` | `/api/subjects` | Create a subject | IMPLEMENTED |
| `PUT` | `/api/subjects/:id` | Update a subject | IMPLEMENTED |
| `DELETE` | `/api/subjects/:id` | Delete an unused subject | IMPLEMENTED |
| `GET` | `/api/teachers` | List teachers | IMPLEMENTED |
| `POST` | `/api/teachers` | Create a teacher account/profile foundation | IMPLEMENTED |
| `PUT` | `/api/teachers/:id` | Update a teacher | IMPLEMENTED |
| `DELETE` | `/api/teachers/:id` | Delete an unused teacher | IMPLEMENTED |
| `GET` | `/api/students` | List students with class references | IMPLEMENTED |
| `POST` | `/api/students` | Create a student and assign a class/RFID | IMPLEMENTED |
| `PUT` | `/api/students/:id` | Update a student | IMPLEMENTED |
| `DELETE` | `/api/students/:id` | Delete an unused student | IMPLEMENTED |
| `GET` | `/api/face-references/status` | Report provider configuration without secrets | IMPLEMENTED |
| `GET` | `/api/face-references` | List safe enrollment status metadata | IMPLEMENTED |
| `POST` | `/api/face-references` | Request provider-backed enrollment | IMPLEMENTED / PROVIDER REQUIRED |
| `DELETE` | `/api/face-references/:id` | Deactivate a reference | IMPLEMENTED |
| `GET` | `/api/face-verification/status` | Report engine availability and configuration without secrets | IMPLEMENTED |
| `POST` | `/api/face-verification/enroll` | Multipart `studentId` + `image`; provider-backed enrollment boundary | PROVIDER REQUIRED |
| `POST` | `/api/face-verification/verify` | Multipart `studentId` + `image`; verify only that student's reference | PROVIDER REQUIRED |

All future attendance operations must use RFID as the primary identifier and require 1:1 face verification before changing attendance state.

## Timetable Endpoints

| Method | Endpoint | Purpose | Status |
| --- | --- | --- | --- |
| `POST` | `/api/timetable` | Create a validated timetable entry | IMPLEMENTED |
| `GET` | `/api/timetable` | List timetable entries with filters | IMPLEMENTED |
| `GET` | `/api/timetable/:id` | Read one timetable entry | IMPLEMENTED |
| `PUT` | `/api/timetable/:id` | Update a timetable entry | IMPLEMENTED |
| `DELETE` | `/api/timetable/:id` | Deactivate a timetable entry | IMPLEMENTED |

Supported list filters include `classId`, `subjectId`, `teacherId`, `dayOfWeek`, and `isActive`. Reference existence, day, time, and overlapping active class-slot validation are performed by the backend.

## Attendance Endpoints

| Method | Endpoint | Purpose | Status |
| --- | --- | --- | --- |
| `POST` | `/api/attendance/session/start` | Start a session for an active timetable entry | IMPLEMENTED |
| `GET` | `/api/attendance/session/active` | Retrieve the active session, with optional class/teacher filters | IMPLEMENTED |
| `POST` | `/api/attendance/session/:id/close` | Finalize all records and close a session | IMPLEMENTED |
| `POST` | `/api/attendance/scan` | Process RFID plus supplied face-verification result | IMPLEMENTED |
| `GET` | `/api/attendance/live/:sessionId` | Return live states, counts, and subject percentage | IMPLEMENTED |
| `GET` | `/api/attendance/student/:studentId/subject/:subjectId` | Return one student's subject attendance | IMPLEMENTED |
| `GET` | `/api/attendance/student/:studentId` | Return a student's attendance across subjects | IMPLEMENTED |
| `GET` | `/api/attendance/register` | Return attendance records with filters | IMPLEMENTED |

## Scan Rules

The implemented scan workflow:

1. Resolve the RFID UID to one student.
2. Identify the active timetable-based attendance session.
3. Ask the backend face-verification provider to process the captured image against that student's enrolled reference.
4. Read the student's current state.
5. Create `ENTRY` when the state is `NOT_SCANNED` or `OUTSIDE`.
6. Create `EXIT` when the state is `IN_CLASS`.
7. Reject invalid RFID or failed face verification without changing state or creating an event.

## Session Close Rules

At session close, the API finalizes each record as follows:

| Current state | Final state | Final status |
| --- | --- | --- |
| `IN_CLASS` | `IN_CLASS` | `PRESENT` |
| `OUTSIDE` | `OUTSIDE` | `LEFT_EARLY` |
| `NOT_SCANNED` | `NOT_SCANNED` | `ABSENT` |

Only `PRESENT` contributes to subject attendance percentage.

## Response Concepts

Responses expose:

- Student identity and RFID status.
- Face verification status.
- Timetable, subject, class, teacher, and session context.
- Current movement state: `NOT_SCANNED`, `IN_CLASS`, or `OUTSIDE`.
- Final status: `PRESENT`, `LEFT_EARLY`, or `ABSENT`.
- Subject-wise percentage calculated from completed attendance records.

The API does not expose stack traces, credentials, raw image data, or embeddings. The current provider performs real descriptor generation and comparison, but returns `THRESHOLD_NOT_CONFIGURED` until a calibrated threshold is supplied.

## Face Verification Boundary

Attendance scans accept a multipart image after resolving RFID to a student and call the backend face-verification service against only that student's enrolled descriptor. If no provider is configured, the scan is rejected with `SERVICE_UNAVAILABLE`; if no threshold is configured, it is rejected with `THRESHOLD_NOT_CONFIGURED`; neither path changes attendance state or creates an event. Development mode remains explicit and is not biometric comparison.

The intended engine compares embedding distance, where lower distance is better. `FACE_MATCH_THRESHOLD` is reserved for a calibrated provider configuration and is currently unset; no arbitrary threshold is used.

## Frontend Integration

The frontend uses `VITE_API_BASE_URL` and calls the implemented routes through one centralized API client. Live attendance polls `/api/attendance/live/:sessionId` every four seconds and stops polling after the backend close-session request succeeds. The frontend does not duplicate state transitions or attendance calculations.

The current backend does not expose CRUD endpoints for students, teachers, subjects, or classes, so their Phase 4 pages present explicit unavailable states rather than fabricated data or writes.
