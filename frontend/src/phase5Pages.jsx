import { useEffect, useState } from 'react';
import api from './services/api';
import { DataTable, EmptyState, ErrorState, LoadingState, Modal, PageIntro, StatusBadge } from './components';

function useResource(load, deps = []) {
  const [state, setState] = useState({ loading: true, error: '', data: [] });
  const reload = async () => { setState({ loading: true, error: '', data: [] }); try { const result = await load(); setState({ loading: false, error: '', data: result?.data ?? result ?? [] }); } catch (error) { setState({ loading: false, error: error.message, data: [] }); } };
  useEffect(() => { reload(); }, deps);
  return { ...state, reload };
}

function FormField({ label, children }) { return <label className="form-field">{label}{children}</label>; }
function entityFormValues(type, initial) {
  if (type === 'classes') return { name: initial?.name || '', section: initial?.section || '', academicYear: initial?.academicYear || '' };
  if (type === 'subjects') return { name: initial?.name || '', code: initial?.code || '', description: initial?.description || '' };
  return { name: initial?.name || '', employeeId: initial?.employeeId || '', ...(initial ? {} : { email: '' }) };
}

function EntityForm({ type, initial, onClose, onSaved }) {
  const [form, setForm] = useState(() => entityFormValues(type, initial));
  const [error, setError] = useState(''); const [saving, setSaving] = useState(false);
  const fields = type === 'classes' ? [['name', 'Class name'], ['section', 'Section'], ['academicYear', 'Academic year']] : type === 'subjects' ? [['name', 'Subject name'], ['code', 'Subject code'], ['description', 'Description']] : [['name', 'Teacher name'], ['employeeId', 'Employee ID'], ...(!initial ? [['email', 'Email (optional)']] : [])];
  const save = async (event) => {
    event.preventDefault(); setSaving(true); setError('');
    try {
      const create = { classes: api.createClass, subjects: api.createSubject, teachers: api.createTeacher }[type];
      const update = { classes: api.updateClass, subjects: api.updateSubject, teachers: api.updateTeacher }[type];
      if (initial?._id) await update(initial._id, form);
      else await create(form);
      await onSaved();
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };
  const label = type === 'classes' ? 'class' : type === 'subjects' ? 'subject' : 'teacher';
  return <Modal title={`${initial ? 'Edit' : 'Add'} ${label}`} onClose={onClose}><form className="form-grid" onSubmit={save}>{fields.map(([key, fieldLabel]) => <FormField key={key} label={fieldLabel}><input required={key !== 'description' && key !== 'email'} type={key === 'email' ? 'email' : 'text'} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} /></FormField>)}{initial?.userId?.email && <div className="enrollment-note"><strong>Account email</strong><span>{initial.userId.email} · account credentials are managed separately.</span></div>}{error && <div className="form-error">{error}</div>}<div className="form-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={saving}>{saving ? 'Saving...' : initial ? 'Save changes' : 'Create record'}</button></div></form></Modal>;
}

export function SetupCenter() {
  const classes = useResource(api.classes, []);
  const subjects = useResource(api.subjects, []);
  const teachers = useResource(api.teachers, []);
  const students = useResource(api.students, []);
  const faces = useResource(api.faceReferences, []);
  const timetable = useResource(() => api.timetables('?isActive=true'), []);
  const steps = [
    { label: 'Classes', count: classes.data.length, resource: classes, link: '/admin/classes' },
    { label: 'Subjects', count: subjects.data.length, resource: subjects, link: '/admin/subjects' },
    { label: 'Teachers', count: teachers.data.length, resource: teachers, link: '/admin/teachers' },
    { label: 'Students', count: students.data.length, resource: students, link: '/admin/students' },
    { label: 'RFID registration', count: students.data.filter((student) => student.rfidUid).length, resource: students, link: '/admin/students' },
    { label: 'Face enrollment', count: faces.data.filter((face) => face.isActive && face.status === 'ACTIVE').length, resource: faces, link: '/admin/face-enrollment' },
    { label: 'Timetable', count: timetable.data.length, resource: timetable, link: '/admin/timetable' }
  ];
  return <>
    <PageIntro eyebrow="ADMIN / SETUP CENTER" title="Let's set up your classroom"><span>Build the data foundation in order. Counts are loaded from the backend; a failed request is shown as unavailable rather than as an empty setup.</span></PageIntro>
    <div className="setup-grid">{steps.map((step, index) => <article className="setup-card" key={step.label}>
      <span className="setup-number">0{index + 1}</span>
      <div><p>{step.label}</p><strong>{step.resource.loading ? 'Loading...' : step.resource.error ? 'Unavailable' : step.count ? `✓ ${step.count} configured` : 'Needs setup'}</strong>{step.resource.error && <small role="alert">{step.resource.error}</small>}</div>
      <a className="text-link" href={step.link}>Open →</a>
    </article>)}</div>
    <div className="setup-callout"><div><p className="eyebrow">FACE VERIFICATION FOUNDATION</p><h3>Camera service boundary</h3><p>Face enrollment will only mark a student enrolled after the backend provider confirms it. The current system reports the provider status and never fabricates an embedding or camera capture.</p></div><StatusBadge value={faces.loading ? 'CHECKING' : faces.error ? 'UNAVAILABLE' : steps[5].count ? 'ACTIVE' : 'NOT_ENROLLED'} /></div>
  </>;
}

export function EntityPage({ type, title, eyebrow }) {
  const data = useResource(api[type], []);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');
  const columns = {
    classes: [
      { key: 'name', label: 'Class' },
      { key: 'section', label: 'Section' },
      { key: 'academicYear', label: 'Academic year' },
      { key: 'isActive', label: 'Status', render: (row) => <StatusBadge value={row.isActive ? 'ACTIVE' : 'INACTIVE'} /> }
    ],
    subjects: [
      { key: 'name', label: 'Subject' },
      { key: 'code', label: 'Code' },
      { key: 'description', label: 'Description' },
      { key: 'isActive', label: 'Status', render: (row) => <StatusBadge value={row.isActive ? 'ACTIVE' : 'INACTIVE'} /> }
    ],
    teachers: [
      { key: 'name', label: 'Teacher' },
      { key: 'employeeId', label: 'Employee ID' },
      { key: 'userId', label: 'Account', render: (row) => row.userId?.email || 'Linked' }
    ]
  }[type];
  const singular = type === 'classes' ? 'class' : type === 'subjects' ? 'subject' : 'teacher';
  const changeActive = async (row) => {
    setError('');
    try {
      await ({ classes: api.updateClass, subjects: api.updateSubject }[type])(row._id, { isActive: !row.isActive });
      await data.reload();
    } catch (e) {
      setError(e.message);
    }
  };
  const remove = async (row) => {
    if (!window.confirm(`Delete ${singular} "${row.name}"? Records in use cannot be deleted.`)) return;
    setError('');
    try {
      await ({ classes: api.deleteClass, subjects: api.deleteSubject, teachers: api.deleteTeacher }[type])(row._id);
      await data.reload();
    } catch (e) {
      setError(e.message);
    }
  };
  const rows = data.data.map((row) => ({
    ...row,
    actions: <div className="row-actions">
      <button className="table-action" onClick={() => setEditing(row)}>Edit</button>
      {type !== 'teachers' && <button className="table-action" onClick={() => changeActive(row)}>{row.isActive ? 'Deactivate' : 'Reactivate'}</button>}
      <button className="table-action danger" onClick={() => remove(row)}>Delete</button>
    </div>
  }));
  return <>
    <PageIntro eyebrow={eyebrow} title={title} action={<button className="button primary" onClick={() => setEditing({})}>+ Add {singular}</button>}>
      <span>Create, edit, deactivate, or remove setup records. The backend prevents deletion while records are in use.</span>
    </PageIntro>
    {error && <div className="notice error-state" role="alert">{error}</div>}
    {data.loading ? <LoadingState label={`Loading ${title.toLowerCase()}`} /> : data.error ? <ErrorState error={data.error} onRetry={data.reload} /> : <DataTable columns={[...columns, { key: 'actions', label: 'Actions' }]} rows={rows} empty={`No ${title.toLowerCase()} yet`} />}
    {editing && <EntityForm type={type} initial={editing._id ? editing : null} onClose={() => setEditing(null)} onSaved={data.reload} />}
  </>;
}

function StudentForm({ classes, initial, onClose, onSaved }) {
  const [form, setForm] = useState(() => ({
    name: initial?.name || '',
    rollNumber: initial?.rollNumber || '',
    classId: initial?.classId?._id || initial?.classId || '',
    rfidUid: initial?.rfidUid || ''
  }));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (initial?._id) await api.updateStudent(initial._id, form);
      else await api.createStudent(form);
      await onSaved();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };
  return <Modal title={initial ? 'Edit student' : 'Add new student'} onClose={onClose}>
    <form className="form-grid" onSubmit={save}>
      <FormField label="Student name"><input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></FormField>
      <FormField label="Roll number"><input required value={form.rollNumber} onChange={(event) => setForm({ ...form, rollNumber: event.target.value })} /></FormField>
      <FormField label="Class"><select required value={form.classId} onChange={(event) => setForm({ ...form, classId: event.target.value })}><option value="">Select class</option>{classes.map((item) => <option key={item._id} value={item._id}>{item.name} / {item.section}</option>)}</select></FormField>
      <FormField label="RFID UID · manual development registration"><input required value={form.rfidUid} onChange={(event) => setForm({ ...form, rfidUid: event.target.value })} placeholder="Enter UID from future ESP32 scan" /></FormField>
      <div className="enrollment-note"><strong>Face: {initial ? 'enrollment managed separately' : 'Not enrolled'}</strong><span>Face data is managed through the face enrollment page and is not changed here.</span></div>
      {error && <div className="form-error" role="alert">{error}</div>}
      <div className="form-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={saving || !classes.length}>{saving ? 'Saving...' : initial ? 'Save changes' : 'Save student'}</button></div>
    </form>
  </Modal>;
}

export function StudentsPage() {
  const students = useResource(api.students, []);
  const classes = useResource(api.classes, []);
  const faces = useResource(api.faceReferences, []);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');
  const faceIds = new Set(faces.data.filter((face) => face.isActive && face.status === 'ACTIVE').map((face) => String(face.studentId?._id || face.studentId)));
  const changeActive = async (student) => {
    setError('');
    try {
      await api.updateStudent(student._id, { isActive: student.isActive === false });
      await students.reload();
    } catch (err) {
      setError(err.message);
    }
  };
  const remove = async (student) => {
    if (!window.confirm(`Delete student "${student.name}"? Students with attendance or face references cannot be deleted.`)) return;
    setError('');
    try {
      await api.deleteStudent(student._id);
      await students.reload();
    } catch (err) {
      setError(err.message);
    }
  };
  const rows = students.data.map((student) => ({
    ...student,
    face: <StatusBadge value={faceIds.has(String(student._id)) ? 'ENROLLED' : 'NOT_ENROLLED'} />,
    status: <StatusBadge value={student.isActive === false ? 'INACTIVE' : 'ACTIVE'} />,
    actions: <div className="row-actions">
      <button className="table-action" onClick={() => setEditing(student)}>Edit</button>
      <button className="table-action" onClick={() => changeActive(student)}>{student.isActive === false ? 'Reactivate' : 'Deactivate'}</button>
      <button className="table-action danger" onClick={() => remove(student)}>Delete</button>
    </div>
  }));
  return <>
    <PageIntro eyebrow="ADMIN / ENROLLMENT" title="Students" action={<button className="button primary" onClick={() => setEditing({})} disabled={!classes.data.length}>+ Add student</button>}>
      <span>Register and maintain student identity, class, and RFID data. Face enrollment remains a separate provider-backed workflow.</span>
    </PageIntro>
    {!classes.loading && !classes.data.length && <div className="notice">Create a class first before adding students. <a className="text-link" href="/admin/classes">Open classes →</a></div>}
    {error && <div className="notice error-state" role="alert">{error}</div>}
    {students.loading ? <LoadingState label="Loading students" /> : students.error ? <ErrorState error={students.error} onRetry={students.reload} /> : <DataTable columns={[
      { key: 'name', label: 'Student', render: (row) => <b>{row.name}</b> },
      { key: 'rollNumber', label: 'Roll number' },
      { key: 'classId', label: 'Class', render: (row) => row.classId ? `${row.classId.name} / ${row.classId.section}` : '--' },
      { key: 'rfidUid', label: 'RFID', render: (row) => row.rfidUid ? <StatusBadge value="REGISTERED" /> : <StatusBadge value="NOT_SCANNED" /> },
      { key: 'face', label: 'Face' },
      { key: 'status', label: 'Status' },
      { key: 'actions', label: 'Actions' }
    ]} rows={rows} empty="No students enrolled" />}
    {editing && <StudentForm classes={classes.data.filter((item) => item.isActive !== false || item._id === (editing.classId?._id || editing.classId))} initial={editing._id ? editing : null} onClose={() => setEditing(null)} onSaved={students.reload} />}
  </>;
}

function TimetableSetupForm({ classes, subjects, teachers, initial, onClose, onSaved }) { const [form, setForm] = useState(initial || { classId: '', subjectId: '', teacherId: '', dayOfWeek: 'MONDAY', startTime: '09:00', endTime: '10:00', room: '' }); const [error, setError] = useState(''); const [saving, setSaving] = useState(false); const save = async (event) => { event.preventDefault(); setSaving(true); setError(''); try { if (initial?._id) await api.updateTimetable(initial._id, form); else await api.createTimetable(form); onSaved(); onClose(); } catch (e) { setError(e.message); } finally { setSaving(false); } }; return <Modal title={initial ? 'Edit timetable entry' : 'Add timetable entry'} onClose={onClose}><form className="form-grid" onSubmit={save}><FormField label="Class"><select required value={form.classId} onChange={(e) => setForm({ ...form, classId: e.target.value })}><option value="">Select class</option>{classes.map((item) => <option key={item._id} value={item._id}>{item.name} / {item.section}</option>)}</select></FormField><FormField label="Subject"><select required value={form.subjectId} onChange={(e) => setForm({ ...form, subjectId: e.target.value })}><option value="">Select subject</option>{subjects.map((item) => <option key={item._id} value={item._id}>{item.name} ({item.code})</option>)}</select></FormField><FormField label="Teacher"><select required value={form.teacherId} onChange={(e) => setForm({ ...form, teacherId: e.target.value })}><option value="">Select teacher</option>{teachers.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</select></FormField><FormField label="Day"><select value={form.dayOfWeek} onChange={(e) => setForm({ ...form, dayOfWeek: e.target.value })}>{['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY'].map((day) => <option key={day}>{day}</option>)}</select></FormField><FormField label="Start"><input type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} /></FormField><FormField label="End"><input type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} /></FormField><FormField label="Room"><input value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })} placeholder="Lab 3" /></FormField>{error && <div className="form-error">{error}</div>}<div className="form-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={saving || !classes.length || !subjects.length || !teachers.length}>{saving ? 'Saving...' : 'Save timetable'}</button></div></form></Modal>; }

export function TimetableSetupPage() { const data = useResource(() => api.timetables('?isActive=true'), []); const classes = useResource(api.classes, []); const subjects = useResource(api.subjects, []); const teachers = useResource(api.teachers, []); const [editing, setEditing] = useState(null); const deactivate = async (id) => { if (!window.confirm('Deactivate this timetable entry?')) return; try { await api.deactivateTimetable(id); data.reload(); } catch (e) { window.alert(e.message); } }; const missing = !classes.data.length || !subjects.data.length || !teachers.data.length; return <><PageIntro eyebrow="ADMIN / SCHEDULE" title="Timetable" action={<button className="button primary" disabled={missing} onClick={() => setEditing({})}>+ Add timetable</button>}><span>Choose human-readable class, subject, and teacher names. The backend remains authoritative for conflict validation.</span></PageIntro>{missing && <div className="notice">{!classes.data.length ? 'Create a class' : !subjects.data.length ? 'Create a subject' : 'Add a teacher'} before creating a timetable.</div>}{data.loading ? <LoadingState label="Loading timetable" /> : data.error ? <ErrorState error={data.error} onRetry={data.reload} /> : <DataTable columns={[{ key: 'dayOfWeek', label: 'Day' }, { key: 'startTime', label: 'Start' }, { key: 'endTime', label: 'End' }, { key: 'subjectId', label: 'Subject', render: (r) => r.subjectId?.name || '--' }, { key: 'classId', label: 'Class', render: (r) => r.classId ? `${r.classId.name} / ${r.classId.section}` : '--' }, { key: 'teacherId', label: 'Teacher', render: (r) => r.teacherId?.name || '--' }, { key: 'room', label: 'Room' }, { key: 'actions', label: '', render: (r) => <div className="row-actions"><button className="table-action" onClick={() => setEditing(r)}>Edit</button><button className="table-action danger" onClick={() => deactivate(r._id)}>Deactivate</button></div> }]} rows={data.data} empty="No active timetable entries" />}{editing && <TimetableSetupForm initial={editing._id ? editing : null} classes={classes.data} subjects={subjects.data} teachers={teachers.data} onClose={() => setEditing(null)} onSaved={data.reload} />}</>; }

export function FaceEnrollmentPage() { const students = useResource(api.students, []); const provider = useResource(api.faceProviderStatus, []); const [studentId, setStudentId] = useState(''); const [file, setFile] = useState(null); const [message, setMessage] = useState(''); const [saving, setSaving] = useState(false); const enroll = async (event) => { event.preventDefault(); if (!studentId || !file) return; setSaving(true); setMessage(''); try { await api.enrollFaceImage(studentId, file); setMessage('Face enrollment confirmed by the backend.'); } catch (error) { setMessage(error.message); } finally { setSaving(false); } }; return <><PageIntro eyebrow="ADMIN / FACE ENROLLMENT" title="Face enrollment"><span>Development Face Enrollment. The image is sent to the backend provider boundary; this page never claims success without a successful backend response.</span></PageIntro><div className="panel enrollment-panel"><form className="form-grid" onSubmit={enroll}><FormField label="Student"><select required value={studentId} onChange={(e) => setStudentId(e.target.value)}><option value="">Select student</option>{students.data.map((student) => <option key={student._id} value={student._id}>{student.name} / {student.rollNumber}</option>)}</select></FormField><FormField label="Enrollment image"><input required type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setFile(e.target.files?.[0] || null)} /></FormField><div className="enrollment-note"><strong>Provider: {provider.loading ? 'Checking...' : provider.data?.configured ? provider.data.engine : 'Camera service not connected'}</strong><span>Face data is processed in memory and no raw image is stored by this foundation.</span></div>{message && <div className="form-error">{message}</div>}<div className="form-actions"><button className="button primary" disabled={saving || !students.data.length}>{saving ? 'Sending...' : 'Capture / enroll'}</button></div></form></div></>; }

export function FaceVerificationTest() {
  const students = useResource(api.students, []); const provider = useResource(api.faceProviderStatus, []); const [studentId, setStudentId] = useState(''); const [file, setFile] = useState(null); const [result, setResult] = useState(null); const [running, setRunning] = useState(false);
  const verify = async (event) => { event.preventDefault(); if (!studentId || !file) return; setRunning(true); setResult(null); try { const response = await api.verifyFaceImage(studentId, file); setResult(response.data); } catch (error) { setResult({ verified: false, reason: error.message }); } finally { setRunning(false); } };
  return <><PageIntro eyebrow="ADMIN / DEVELOPMENT TOOL" title="Face verification test"><span>Development/Test Tool - Not the production attendance interface. RFID identifies the selected student; this endpoint verifies only against that student's enrolled reference.</span></PageIntro><div className="test-layout"><form className="panel form-grid" onSubmit={verify}><FormField label="Student"><select required value={studentId} onChange={(e) => setStudentId(e.target.value)}><option value="">Select student</option>{students.data.map((student) => <option key={student._id} value={student._id}>{student.name} / {student.rollNumber}</option>)}</select></FormField><FormField label="Development test image"><input required type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setFile(e.target.files?.[0] || null)} /></FormField><div className="enrollment-note"><strong>Provider status: {provider.loading ? 'Checking...' : provider.data?.configured ? provider.data.engine : 'Not configured'}</strong><span>Images are held in memory for the request only. No raw image or embedding is returned to React.</span></div><div className="form-actions"><button className="button primary" disabled={running || !students.data.length}>{running ? 'Verifying...' : 'Run verification'}</button></div></form><section className="panel result-panel"><p className="eyebrow">RESULT</p>{!result ? <EmptyState title="No test run">Select a student and image to test the provider boundary.</EmptyState> : <><StatusBadge value={result.verified ? 'VERIFIED' : 'REJECTED'} /><h3>{result.verified ? 'Match accepted' : 'Verification unavailable or rejected'}</h3><p className="muted">Reason: {result.reason || 'UNKNOWN'}</p>{result.metric != null && <p className="muted">Metric: {result.metric} · Threshold: {result.threshold}</p>}</>}</section></div></>;
}