import { clearAccessToken, getAccessToken, setAccessToken } from '../auth.js';
const API_BASE_URL = (import.meta.env?.VITE_API_BASE_URL || 'http://localhost:5000').replace(/\/$/, '');

async function request(path, options = {}) {
  let response;
  const isFormData = options.body instanceof FormData;
  const token = getAccessToken();
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        ...(isFormData ? (options.headers || {}) : { 'Content-Type': 'application/json', ...(options.headers || {}) }),
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      }
    });
  } catch {
    throw new Error('Backend unavailable. Start the backend server and try again.');
  }

  const payload = await response.json().catch(() => ({}));
  if (response.status === 401 && token) {
    clearAccessToken();
    window.dispatchEvent(new Event('auth:expired'));
  }
  if (!response.ok || payload.success === false) {
    throw new Error(payload.message || `Request failed with status ${response.status}`);
  }
  return payload;
}

const api = {
  health: () => request('/api/health/db'),
  login: async (credentials) => {
    const result = await request('/api/auth/login', { method: 'POST', body: JSON.stringify(credentials) });
    setAccessToken(result.data.token);
    return result;
  },
  currentUser: () => request('/api/auth/me'),
  logout: () => request('/api/auth/logout', { method: 'POST', body: '{}' }),
  myAttendance: () => request('/api/attendance/me'),
  timetables: (query = '') => request(`/api/timetable${query}`),
  timetable: (id) => request(`/api/timetable/${id}`),
  createTimetable: (data) => request('/api/timetable', { method: 'POST', body: JSON.stringify(data) }),
  updateTimetable: (id, data) => request(`/api/timetable/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deactivateTimetable: (id) => request(`/api/timetable/${id}`, { method: 'DELETE' }),
  activeSession: (query = '') => request(`/api/attendance/session/active${query}`),
  attendanceSessions: (query = '') => request(`/api/attendance/sessions${query}`),
  startSession: (timetableId) => request('/api/attendance/session/start', { method: 'POST', body: JSON.stringify({ timetableId }) }),
  closeSession: (id) => request(`/api/attendance/session/${id}/close`, { method: 'POST', body: '{}' }),
  liveAttendance: (id) => request(`/api/attendance/live/${id}`),
  register: (query = '') => request(`/api/attendance/register${query}`),
  attendanceReport: (query = '') => request(`/api/attendance/report${query}`),
  attendanceActivity: () => request('/api/attendance/activity'),
  myTimetable: () => request('/api/attendance/timetable/me'),
  studentAttendance: (id) => request(`/api/attendance/student/${id}`),
  subjectAttendance: (studentId, subjectId) => request(`/api/attendance/student/${studentId}/subject/${subjectId}`),
  students: (query = '') => request(`/api/students${query}`),
  student: (id) => request(`/api/students/${id}`),
  createStudent: (data) => request('/api/students', { method: 'POST', body: JSON.stringify(data) }),
  updateStudent: (id, data) => request(`/api/students/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteStudent: (id) => request(`/api/students/${id}`, { method: 'DELETE' }),
  teachers: (query = '') => request(`/api/teachers${query}`),
  createTeacher: (data) => request('/api/teachers', { method: 'POST', body: JSON.stringify(data) }),
  updateTeacher: (id, data) => request(`/api/teachers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteTeacher: (id) => request(`/api/teachers/${id}`, { method: 'DELETE' }),
  subjects: (query = '') => request(`/api/subjects${query}`),
  createSubject: (data) => request('/api/subjects', { method: 'POST', body: JSON.stringify(data) }),
  updateSubject: (id, data) => request(`/api/subjects/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteSubject: (id) => request(`/api/subjects/${id}`, { method: 'DELETE' }),
  classes: (query = '') => request(`/api/classes${query}`),
  createClass: (data) => request('/api/classes', { method: 'POST', body: JSON.stringify(data) }),
  updateClass: (id, data) => request(`/api/classes/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteClass: (id) => request(`/api/classes/${id}`, { method: 'DELETE' }),
  faceStatus: () => request('/api/face-references/status'),
  faceReferences: () => request('/api/face-references'),
  enrollFace: (data) => request('/api/face-references', { method: 'POST', body: JSON.stringify(data) }),
  faceProviderStatus: () => request('/api/face-verification/status'),
  verifyFaceImage: (studentId, file) => { const body = new FormData(); body.append('studentId', studentId); body.append('image', file); return request('/api/face-verification/verify', { method: 'POST', headers: {}, body }); },
  enrollFaceImage: (studentId, file) => { const body = new FormData(); body.append('studentId', studentId); body.append('image', file); return request('/api/face-verification/enroll', { method: 'POST', headers: {}, body }); }
};

export { API_BASE_URL };
export default api;
