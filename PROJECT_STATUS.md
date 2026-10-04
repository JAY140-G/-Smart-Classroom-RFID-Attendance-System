# Smart Classroom Attendance System

## Project Status

### Phase 1 Foundation
- Backend foundation is implemented with a CommonJS Node.js and Express server.
- The finalized architecture uses RFID as the primary student identifier and backend 1:1 face verification as secondary verification.
- Attendance is timetable-driven and subject-specific.
- Live attendance uses the movement states `NOT_SCANNED`, `IN_CLASS`, and `OUTSIDE`.
- Session finalization produces `PRESENT`, `LEFT_EARLY`, or `ABSENT`; only `PRESENT` counts toward subject attendance percentage.
- Architecture, database, and planned API documentation are recorded in `docs/`.

### Phase 2 Database Foundation
- [x] MongoDB/Mongoose configuration
- [x] Ten database models
- [x] Model relationships
- [x] Indexes and constraints
- [x] Database health check
- Attendance services, setup CRUD APIs, face verification, authentication, and integrated dashboard/report surfaces were added in later phases. Deployment security hardening and hardware firmware remain incomplete.

### Phase 3 Attendance and Timetable Logic
- [x] Timetable CRUD and conflict validation
- [x] Attendance session start and active-session lookup
- [x] RFID plus supplied face-verification scan input
- [x] ENTRY/EXIT movement state machine
- [x] Attendance events and records
- [x] Session finalization to PRESENT, LEFT_EARLY, or ABSENT
- [x] Subject-wise attendance calculation
- [x] Live attendance and register endpoints
- Face verification, frontend attendance, role-based authentication, and role-scoped dashboard/report pages were implemented in later phases. Authentication deployment hardening, hardware communication, and notifications remain incomplete.

### Planning
- [x] Final project concept
- [x] System architecture
- [x] Hardware architecture
- [x] Database design documentation
- [x] API design documentation
- [ ] Face verification technology selection

### Phase 4 Frontend Dashboard and API Integration
- [x] React/Vite frontend foundation
- [x] Centralized API client using `VITE_API_BASE_URL`
- [x] Responsive dashboard shell and routing
- [x] Timetable management page
- [x] Start attendance page
- [x] Live attendance polling and close attendance flow
- [x] Attendance register and subject reports with date, class, subject, and status filters
- [x] Student attendance and history views
- [x] Loading, error, empty, and unavailable states
- Credential login, role-aware navigation, responsive mobile navigation, and logout are integrated; deployment hardening is still required. Student, teacher, subject, and class setup workflows use the existing backend CRUD APIs.

### Phase 5 Face Verification Foundation and Enrollment Architecture
- [x] Enrollment-ready face reference model
- [x] Face verification service abstraction
- [x] Service-authoritative attendance verification boundary
- [x] Student, teacher, subject, and class CRUD APIs
- [x] Setup Center and student enrollment workflows
- [x] Human-readable timetable setup workflow
- [x] Face provider status and safe reference endpoints
- Actual camera capture, face model/provider, biometric enrollment, liveness, and physical ESP32-CAM integration remain future work.

### Phase 6 Actual Face Verification Engine
- [x] Real WASM face engine installed and model weights available
- [x] Multipart enrollment/verification API boundary
- [x] Image type and size validation
- [x] Provider-authoritative attendance gate
- [x] Development verification test page
- [x] Real enrollment embedding generation
- [x] Real 1:1 embedding comparison
- [ ] Threshold calibration with representative single-face samples
- Production acceptance remains blocked until a calibrated `FACE_MATCH_THRESHOLD` is configured.

### Backend
- [x] Node.js project
- [x] Express server
- [x] MongoDB connection foundation
- [x] Attendance and timetable business logic
- [x] RFID attendance input processing
- [x] Student, teacher, subject, and class CRUD APIs
- [x] Face verification service boundary
- [x] Multipart face verification API boundary
- [x] Actual WASM face verification integration
- [ ] Face threshold calibration
- [x] Authentication and role-based backend authorization foundation
- [x] Filtered attendance reports, completed-record totals, subject comparison, and recent activity APIs

### Frontend
- [x] React/Vite project
- [x] Credential login and role-directed dashboards
- [x] Admin command center with backend-backed directory counts, attendance totals, active sessions, activity, and quick actions
- [x] Teacher dashboard with assigned timetable, sessions, live states, completed outcomes, reports, and scoped activity
- [x] Student dashboard with own overall/subject rates, history, and timetable
- [x] Filterable attendance register and reports with safe CSV export
- [x] Responsive navigation, dashboard cards, attendance bars, and accessible loading/error/empty feedback
- Attendance percentages are calculated server-side from completed records only, use PRESENT / completed records, exclude active sessions, and return `null` when no completed data exists. UI display uses one decimal place and distinguishes unavailable from `0.0%`.

### Hardware
- [ ] ESP32
- [ ] RC522 RFID
- [ ] OLED
- [ ] Buzzer
- [ ] LEDs
- [ ] ESP32-CAM
- [ ] Hardware testing

### Integration
- [ ] ESP32 → Backend
- [ ] ESP32-CAM → Backend
- [ ] Backend → MongoDB
- [ ] Backend → React
- [ ] Full attendance test

### Documentation
- [x] Architecture diagram
- [ ] Circuit diagram
- [x] Database documentation
- [x] API documentation foundation
- [ ] Testing documentation
- [ ] Final report
- [ ] Final PPT

### Current Reliability Progress (2026-10-04)
- [x] Added a database-free Node.js test suite for attendance scan validation, face-verification gating, state transitions, receipt replay/conflicts, transactional write paths, and duplicate-key race handling.
- [x] Added `npm test` for the backend.
- Tests use mocked Mongoose operations. They do not prove MongoDB transaction behavior against Atlas and do not create attendance records.
- Backend transaction integration testing, authentication deployment hardening, calibrated face threshold, physical RFID debounce, firmware, and hardware validation remain incomplete.

### Authentication and Role Authorization (2026-10-04)
- [x] Added one-time, secret-gated initial administrator bootstrap.
- [x] Added scrypt password hashing, eight-hour opaque bearer sessions, hashed session-token persistence, expiry, current-user lookup, and logout revocation.
- [x] Protected setup, timetable, face, and attendance endpoints with backend role checks; students are limited to their own attendance, and teachers are limited to assigned timetables/sessions/classes.
- [x] Replaced the demo role selector with an email/password login and role-directed navigation.
- [x] New student and teacher accounts require email and initial password; passwords are not returned from entity APIs.
- [x] Attendance scan requests now fail closed unless the separate device key is configured.
- Existing teacher/student accounts created with `AUTH_NOT_IMPLEMENTED` cannot sign in until an administrator resets their password and email. Self-service recovery, MFA, rate limiting, per-device credentials, deployment HTTPS/CORS configuration, and live Atlas validation remain outstanding.

### Setup and Dashboard Progress
- [x] Student setup supports create, edit, deactivate/reactivate, and guarded deletion.
- [x] Class and subject setup supports create, edit, deactivate/reactivate, and backend-guarded deletion.
- [x] Teacher setup supports create, edit, and backend-guarded deletion. Teacher deactivation is not available because the current Teacher model has no active-status field.
- [x] Setup Center counts show loading and request-failure states instead of treating failed requests as empty collections.
- [x] Dashboard student, teacher, and active-subject counts load from existing APIs and show request failures honestly.
- [x] Added mocked-fetch frontend API tests covering CRUD endpoint mapping and bearer-token forwarding.
- Verification: frontend production build passed; frontend API tests passed (4/4); lint completed with existing warnings for unused imports/props and hook dependency/state-in-effect patterns. These checks do not validate a live backend, database, authentication, or hardware integration.

### Dashboard and Reporting Improvements (2026-10-04)
- [x] Added scoped admin, teacher, and student dashboards that use existing setup, timetable, session, report, activity, and authenticated student APIs.
- [x] Added one-decimal backend percentages based on completed attendance records only; active/incomplete sessions are excluded and no-data is `null`, not `0`.
- [x] Added date-range, class, subject, and final-status report filters, attendance totals, per-subject comparisons, student search, and CSV export with quote escaping and spreadsheet formula-prefix neutralization.
- [x] Added student-only authenticated summary/timetable views and teacher-scoped session, report, register, and activity views.
- [x] Added responsive dashboard styling and mobile sidebar controls; documented report routes and percentage/filter semantics in `docs/api/API_FOUNDATION.md`.
- Verification: backend tests passed (25/25); frontend tests passed (7/7); frontend production build passed; syntax checks passed for all changed backend JavaScript files; `git diff --check` passed. These are database-free/unit/build checks, not live API, MongoDB, authentication deployment, browser visual, or hardware validation.
- Remaining limitations: report/register and student history currently load matching records without pagination; CSV exports the currently loaded, searched rows. No live database, deployed-auth, browser/device, or physical hardware verification was performed. Face enrollment/verification status is available through existing setup/face screens; camera capture and hardware integration remain separate milestones.