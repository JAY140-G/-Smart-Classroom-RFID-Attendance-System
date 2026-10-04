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
- Attendance business logic, CRUD APIs, authentication, face recognition, frontend, and firmware remain future work.

### Phase 3 Attendance and Timetable Logic
- [x] Timetable CRUD and conflict validation
- [x] Attendance session start and active-session lookup
- [x] RFID plus supplied face-verification scan input
- [x] ENTRY/EXIT movement state machine
- [x] Attendance events and records
- [x] Session finalization to PRESENT, LEFT_EARLY, or ABSENT
- [x] Subject-wise attendance calculation
- [x] Live attendance and register endpoints
- Actual face verification, authentication, frontend, hardware communication, and notifications remain future work.

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
- [x] Attendance register and subject reports
- [x] Student attendance and history views
- [x] Loading, error, empty, and unavailable states
- Demo role selection is not production authentication; student/teacher/class CRUD remains unavailable until backend APIs exist.

### Phase 5 Face Verification Foundation and Enrollment Architecture
- [x] Enrollment-ready face reference model
- [x] Face verification service abstraction
- [x] Service-authoritative attendance verification boundary
- [x] Student, teacher, subject, and class CRUD APIs
- [x] Setup Center and student enrollment workflow foundation
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
- [ ] Authentication
- [ ] Reports

### Frontend
- [x] React/Vite project
- [x] Login development placeholder
- [x] Admin dashboard foundation
- [x] Teacher dashboard foundation
- [x] Student dashboard foundation
- [x] Attendance register
- [x] Subject analytics

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
- Backend transaction integration testing, production authentication/authorization, calibrated face threshold, physical RFID debounce, firmware, and hardware validation remain incomplete.