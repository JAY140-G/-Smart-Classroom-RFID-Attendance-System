import { Navigate, Route, Routes } from 'react-router-dom';
import { Shell } from './components';
import { CommandCenter, Login, LiveAttendance, Register, StartAttendance, StudentDashboard, StudentProfile, SubjectReports, TimetablePage, UnavailablePage } from './pages';
import { EntityPage, FaceEnrollmentPage, FaceVerificationTest, SetupCenter, StudentsPage, TimetableSetupPage } from './phase5Pages';

export default function App() {
  return <Routes>
    <Route path="/login" element={<Login />} />
    <Route element={<Shell />}>
      <Route path="/" element={<CommandCenter />} />
      <Route path="/admin/timetable" element={<TimetableSetupPage />} />
      <Route path="/admin/setup" element={<SetupCenter />} />
      <Route path="/admin/students" element={<StudentsPage />} />
      <Route path="/admin/teachers" element={<EntityPage type="teachers" title="Teachers" eyebrow="ADMIN / STAFF DIRECTORY" />} />
      <Route path="/admin/subjects" element={<EntityPage type="subjects" title="Subjects" eyebrow="ADMIN / ACADEMIC CATALOG" />} />
      <Route path="/admin/classes" element={<EntityPage type="classes" title="Classes" eyebrow="ADMIN / COHORTS" />} />
      <Route path="/admin/face-enrollment" element={<FaceEnrollmentPage />} />
      <Route path="/admin/face-verification-test" element={<FaceVerificationTest />} />
      <Route path="/admin/reports" element={<UnavailablePage kind="/admin/reports" />} />
      <Route path="/teacher" element={<Navigate to="/teacher/start-attendance" replace />} />
      <Route path="/teacher/start-attendance" element={<StartAttendance />} />
      <Route path="/teacher/live-attendance" element={<LiveAttendance />} />
      <Route path="/teacher/attendance-register" element={<Register />} />
      <Route path="/teacher/subject-reports" element={<SubjectReports />} />
      <Route path="/student" element={<Navigate to="/student/attendance" replace />} />
      <Route path="/student/profile" element={<StudentProfile />} />
      <Route path="/student/attendance" element={<StudentDashboard />} />
      <Route path="/student/history" element={<StudentDashboard history />} />
    </Route>
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>;
}
