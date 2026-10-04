import { Navigate, Route, Routes } from 'react-router-dom';
import { Shell } from './components';
import { LiveAttendance, StartAttendance } from './pages';
import { Login } from './authPages';
import { EntityPage, FaceEnrollmentPage, FaceVerificationTest, SetupCenter, StudentsPage, TimetableSetupPage } from './phase5Pages';
import { AuthProvider, ProtectedLayout, RequireRole } from './AuthContext';
import { AdminDashboard, AttendanceReports, StudentDashboard, StudentProfile, TeacherDashboard } from './dashboardPages';

export default function App() {
  return <AuthProvider><Routes>
    <Route path="/login" element={<Login />} />
    <Route element={<ProtectedLayout />}><Route element={<Shell />}>
      <Route path="/" element={<RequireRole roles={['ADMIN']}><AdminDashboard /></RequireRole>} />
      <Route path="/admin/timetable" element={<RequireRole roles={['ADMIN']}><TimetableSetupPage /></RequireRole>} />
      <Route path="/admin/setup" element={<RequireRole roles={['ADMIN']}><SetupCenter /></RequireRole>} />
      <Route path="/admin/students" element={<RequireRole roles={['ADMIN']}><StudentsPage /></RequireRole>} />
      <Route path="/admin/teachers" element={<RequireRole roles={['ADMIN']}><EntityPage type="teachers" title="Teachers" eyebrow="ADMIN / STAFF DIRECTORY" /></RequireRole>} />
      <Route path="/admin/subjects" element={<RequireRole roles={['ADMIN']}><EntityPage type="subjects" title="Subjects" eyebrow="ADMIN / ACADEMIC CATALOG" /></RequireRole>} />
      <Route path="/admin/classes" element={<RequireRole roles={['ADMIN']}><EntityPage type="classes" title="Classes" eyebrow="ADMIN / COHORTS" /></RequireRole>} />
      <Route path="/admin/start-attendance" element={<RequireRole roles={['ADMIN']}><StartAttendance /></RequireRole>} />
      <Route path="/admin/live-attendance" element={<RequireRole roles={['ADMIN']}><LiveAttendance /></RequireRole>} />
      <Route path="/admin/face-enrollment" element={<RequireRole roles={['ADMIN']}><FaceEnrollmentPage /></RequireRole>} />
      <Route path="/admin/face-verification-test" element={<RequireRole roles={['ADMIN']}><FaceVerificationTest /></RequireRole>} />
      <Route path="/admin/reports" element={<RequireRole roles={['ADMIN']}><AttendanceReports /></RequireRole>} />
      <Route path="/teacher" element={<RequireRole roles={['TEACHER']}><TeacherDashboard /></RequireRole>} />
      <Route path="/teacher/start-attendance" element={<RequireRole roles={['TEACHER']}><StartAttendance /></RequireRole>} />
      <Route path="/teacher/live-attendance" element={<RequireRole roles={['TEACHER']}><LiveAttendance /></RequireRole>} />
      <Route path="/teacher/attendance-register" element={<RequireRole roles={['TEACHER']}><AttendanceReports mode="register" /></RequireRole>} />
      <Route path="/teacher/subject-reports" element={<RequireRole roles={['TEACHER']}><AttendanceReports mode="teacher" /></RequireRole>} />
      <Route path="/student" element={<RequireRole roles={['STUDENT']}><Navigate to="/student/attendance" replace /></RequireRole>} />
      <Route path="/student/profile" element={<RequireRole roles={['STUDENT']}><StudentProfile /></RequireRole>} />
      <Route path="/student/attendance" element={<RequireRole roles={['STUDENT']}><StudentDashboard /></RequireRole>} />
      <Route path="/student/history" element={<RequireRole roles={['STUDENT']}><StudentDashboard history /></RequireRole>} />
    </Route></Route>
    <Route path="*" element={<Navigate to="/login" replace />} />
  </Routes></AuthProvider>;
}
