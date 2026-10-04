import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import api from './services/api';
import { useAuth } from './AuthContext';
import { DataTable, EmptyState, ErrorState, LoadingState, PageIntro, StatCard, StatusBadge } from './components';
import { downloadCsv, formatPercentage, localDateValue, recordsToCsv } from './reportUtils';

function useRequest(load, dependencies = []) {
  const dependencyKey = JSON.stringify(dependencies);
  const loadRef = useRef(load);
  const [state, setState] = useState({ loading: true, error: '', data: null, dependencyKey });
  useEffect(() => {
    loadRef.current = load;
  }, [load]);
  useEffect(() => {
    let active = true;
    loadRef.current().then((result) => {
      if (active) setState({ loading: false, error: '', data: result?.data ?? result, dependencyKey });
    }).catch((error) => {
      if (active) setState({ loading: false, error: error.message, data: null, dependencyKey });
    });
    return () => { active = false; };
  }, [dependencyKey]);
  return state.dependencyKey === dependencyKey ? state : { ...state, loading: true, error: '' };
}

function resourceValue(resource, project = (value) => value) {
  return resource.loading ? '…' : resource.error ? '—' : project(resource.data);
}

function ActivityTable({ resource }) {
  if (resource.loading) return <LoadingState label="Loading recent attendance activity" />;
  if (resource.error) return <ErrorState error={resource.error} />;
  return <DataTable
    columns={[
      { key: 'student', label: 'Student', render: (row) => <><strong>{row.student?.name || 'Student'}</strong><small className="table-subtext">{row.student?.rollNumber || ''}</small></> },
      { key: 'movement', label: 'Movement', render: (row) => <StatusBadge value={row.type} /> },
      { key: 'context', label: 'Class · subject', render: (row) => `${row.className || '—'} · ${row.subjectName || '—'}` },
      { key: 'timestamp', label: 'Time', render: (row) => row.timestamp ? new Date(row.timestamp).toLocaleString() : '—' }
    ]}
    rows={resource.data || []}
    empty="No attendance activity yet"
  />;
}

function SubjectBars({ subjects, empty = 'No completed subject sessions in this range.' }) {
  if (!subjects?.length) return <EmptyState title="No subject data">{empty}</EmptyState>;
  return <div className="subject-bars">{subjects.map((item) => {
    const percentage = item.attendancePercentage;
    const rate = Number.isFinite(percentage) ? Math.max(0, Math.min(100, percentage)) : 0;
    return <div className="subject-bar-row" key={item.subject?._id || item.subject?.code}>
      <div className="subject-bar-label"><strong>{item.subject?.name || item.subject?.code || 'Subject'}</strong><span>{formatPercentage(percentage)} · {item.presentCount}/{item.completedClassCount} present</span></div>
      <div className="progress-track" role="img" aria-label={`${item.subject?.name || 'Subject'} attendance ${formatPercentage(percentage)}`}>
        <span className={`progress-fill ${rate < 75 ? 'low' : ''}`} style={{ width: `${rate}%` }} />
      </div>
    </div>;
  })}</div>;
}

function queryString(values) {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  const query = params.toString();
  return query ? `?${query}` : '';
}

export function AdminDashboard() {
  const [scope, setScope] = useState({ date: localDateValue(), classId: '', subjectId: '' });
  const classes = useRequest(() => api.classes('?isActive=true'));
  const students = useRequest(() => api.students('?isActive=true'));
  const teachers = useRequest(api.teachers);
  const subjects = useRequest(() => api.subjects('?isActive=true'));
  const sessions = useRequest(() => api.attendanceSessions('?status=ACTIVE'));
  const activity = useRequest(api.attendanceActivity);
  const reportQuery = useMemo(() => queryString({
    date: scope.date,
    classId: scope.classId,
    subjectId: scope.subjectId
  }), [scope.date, scope.classId, scope.subjectId]);
  const report = useRequest(() => api.attendanceReport(reportQuery), [reportQuery]);
  const totals = report.data?.totals;
  const activeSessions = (sessions.data || []).filter((session) =>
    (!scope.classId || String(session.classId?._id) === scope.classId)
    && (!scope.subjectId || String(session.subjectId?._id) === scope.subjectId)
  );

  return <>
    <PageIntro eyebrow="ADMIN / COMMAND CENTER" title="Campus overview">
      <span>Live operational counts and attendance outcomes from the connected backend. Select a date and scope to inspect completed sessions.</span>
    </PageIntro>
    <section className="filter-bar" aria-label="Dashboard filters">
      <label>Date<input type="date" value={scope.date} onChange={(event) => setScope({ ...scope, date: event.target.value })} /></label>
      <label>Class<select value={scope.classId} onChange={(event) => setScope({ ...scope, classId: event.target.value })}><option value="">All classes</option>{(classes.data || []).map((item) => <option key={item._id} value={item._id}>{item.name} / {item.section}</option>)}</select></label>
      <label>Subject<select value={scope.subjectId} onChange={(event) => setScope({ ...scope, subjectId: event.target.value })}><option value="">All subjects</option>{(subjects.data || []).map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</select></label>
      <button className="button secondary" onClick={() => setScope({ date: localDateValue(), classId: '', subjectId: '' })}>Reset</button>
    </section>
    {report.error && <p className="inline-error" role="alert">Attendance summary unavailable: {report.error}</p>}
    <div className="stat-grid">
      <StatCard label="Active students" value={resourceValue(students, (data) => data?.length ?? 0)} detail={students.error ? 'Could not load student directory' : 'Currently enrolled'} />
      <StatCard label="Teachers" value={resourceValue(teachers, (data) => data?.length ?? 0)} detail={teachers.error ? 'Could not load teacher directory' : 'Teacher accounts'} tone="warm" />
      <StatCard label="Classes" value={resourceValue(classes, (data) => data?.length ?? 0)} detail={classes.error ? 'Could not load classes' : 'Active class groups'} />
      <StatCard label="Subjects" value={resourceValue(subjects, (data) => data?.length ?? 0)} detail={subjects.error ? 'Could not load subjects' : 'Active catalog subjects'} tone="green" />
      <StatCard label="Present" value={resourceValue(report, (data) => data?.totals?.presentCount ?? 0)} detail={report.data?.totals?.completedClassCount ? `${report.data.totals.completedClassCount} completed records` : 'No completed sessions for this scope'} tone="green" />
      <StatCard label="Absent" value={resourceValue(report, (data) => data?.totals?.absentCount ?? 0)} detail="Completed session records" tone="warm" />
      <StatCard label="Left early" value={resourceValue(report, (data) => data?.totals?.leftEarlyCount ?? 0)} detail="Completed session records" />
      <StatCard label="Attendance rate" value={resourceValue(report, (data) => formatPercentage(data?.totals?.attendancePercentage))} detail={totals?.completedClassCount ? 'Present / completed sessions' : 'Unavailable until sessions complete'} tone="green" />
    </div>
    <section className="quick-actions" aria-label="Quick actions">
      <Link to="/admin/students">Register student <span>→</span></Link>
      <Link to="/admin/teachers">Manage teachers <span>→</span></Link>
      <Link to="/admin/subjects">Manage subjects <span>→</span></Link>
      <Link to="/admin/classes">Manage classes <span>→</span></Link>
      <Link to="/admin/timetable">Timetable <span>→</span></Link>
      <Link to="/admin/start-attendance">Start attendance <span>→</span></Link>
      <Link to="/admin/reports">Attendance reports <span>→</span></Link>
    </section>
    <div className="dashboard-grid dashboard-grid-wide">
      <section className="panel">
        <div className="panel-head"><div><p className="eyebrow">COMPLETED SESSIONS</p><h3>Subject attendance</h3></div></div>
        {report.loading ? <LoadingState label="Calculating completed-session attendance" /> : report.error ? <ErrorState error={report.error} /> : <SubjectBars subjects={report.data?.subjects} />}
      </section>
      <section className="panel">
        <div className="panel-head"><div><p className="eyebrow">LIVE</p><h3>Active sessions</h3></div></div>
        {sessions.loading ? <LoadingState label="Loading active sessions" /> : sessions.error ? <ErrorState error={sessions.error} /> : activeSessions.length
          ? <div className="session-list">{activeSessions.map((session) => <article className="session-item" key={session._id}>
            <div><strong>{session.subjectId?.name || session.subjectId?.code || 'Subject'}</strong><span>{session.classId?.name || 'Class'} / {session.classId?.section || '—'} · {session.teacherId?.name || 'Teacher'}</span><small>Started {session.startTime || 'time unavailable'}</small></div>
            <div className="session-actions"><StatusBadge value="ACTIVE" /><Link className="text-link" to={`/admin/live-attendance?session=${session._id}`}>Open →</Link></div>
          </article>)}</div>
          : <EmptyState title="No active sessions">A session appears here after a teacher starts attendance.</EmptyState>}
      </section>
      <section className="panel panel-span">
        <div className="panel-head"><div><p className="eyebrow">RECENT MOVEMENTS</p><h3>Attendance activity</h3></div></div>
        <ActivityTable resource={activity} />
      </section>
    </div>
  </>;
}

export function TeacherDashboard() {
  const schedule = useRequest(() => api.timetables('?isActive=true'));
  const sessions = useRequest(() => api.attendanceSessions('?status=ACTIVE'));
  const recentSessions = useRequest(() => api.attendanceSessions(`?status=CLOSED&date=${localDateValue()}`));
  const activity = useRequest(api.attendanceActivity);
  const report = useRequest(() => api.attendanceReport(`?date=${localDateValue()}`));
  const firstSessionId = sessions.data?.[0]?._id;
  const live = useRequest(() => firstSessionId ? api.liveAttendance(firstSessionId) : Promise.resolve({ data: null }), [firstSessionId]);

  return <>
    <PageIntro eyebrow="TEACHER / TODAY" title="Teaching workspace" action={<Link className="button primary" to="/teacher/start-attendance">Start attendance</Link>}>
      <span>Your timetable and active attendance sessions are scoped to your assigned teaching schedule.</span>
    </PageIntro>
    {report.error && <p className="inline-error" role="alert">Today's completed attendance summary unavailable: {report.error}</p>}
    <div className="stat-grid">
      <StatCard label="Today's present" value={resourceValue(report, (data) => data?.totals?.presentCount ?? 0)} detail="Completed assigned sessions" tone="green" />
      <StatCard label="Absent" value={resourceValue(report, (data) => data?.totals?.absentCount ?? 0)} detail="Completed assigned sessions" tone="warm" />
      <StatCard label="Left early" value={resourceValue(report, (data) => data?.totals?.leftEarlyCount ?? 0)} detail="Completed assigned sessions" />
      <StatCard label="Attendance rate" value={resourceValue(report, (data) => formatPercentage(data?.totals?.attendancePercentage))} detail={report.data?.totals?.completedClassCount ? 'Present / completed sessions' : 'No completed sessions today'} tone="green" />
    </div>
    {firstSessionId && <div className="stat-grid live-summary">
      <StatCard label="In class now" value={resourceValue(live, (data) => data?.counts?.inClass ?? 0)} detail="Live movement state" tone="green" />
      <StatCard label="Outside now" value={resourceValue(live, (data) => data?.counts?.outside ?? 0)} detail="Live movement state" tone="warm" />
      <StatCard label="Not scanned" value={resourceValue(live, (data) => data?.counts?.notScanned ?? 0)} detail="Live movement state" />
      <div className="stat-card stat-note"><strong>Live status</strong><p>These are movement states, not finalized attendance statuses.</p></div>
    </div>}
    <div className="dashboard-grid dashboard-grid-wide">
      <section className="panel">
        <div className="panel-head"><div><p className="eyebrow">ASSIGNED</p><h3>Weekly timetable</h3></div><Link className="text-link" to="/teacher/start-attendance">Session controls →</Link></div>
        {schedule.loading ? <LoadingState label="Loading assigned timetable" /> : schedule.error ? <ErrorState error={schedule.error} /> : <DataTable columns={[
          { key: 'dayOfWeek', label: 'Day' },
          { key: 'time', label: 'Time', render: (row) => `${row.startTime}–${row.endTime}` },
          { key: 'subject', label: 'Subject', render: (row) => row.subjectId?.name || row.subjectId?.code || '—' },
          { key: 'class', label: 'Class', render: (row) => `${row.classId?.name || '—'} / ${row.classId?.section || '—'}` },
          { key: 'room', label: 'Room', render: (row) => row.room || '—' }
        ]} rows={schedule.data || []} empty="No active timetable entries are assigned to you" />}
      </section>
      <section className="panel">
        <div className="panel-head"><div><p className="eyebrow">IN PROGRESS</p><h3>Active sessions</h3></div></div>
        {sessions.loading ? <LoadingState label="Loading your active sessions" /> : sessions.error ? <ErrorState error={sessions.error} /> : (sessions.data || []).length
          ? <div className="session-list">{sessions.data.map((session) => <article className="session-item" key={session._id}>
            <div><strong>{session.subjectId?.name || session.subjectId?.code || 'Subject'}</strong><span>{session.classId?.name} / {session.classId?.section} · {session.startTime}</span></div>
            <Link className="button secondary" to={`/teacher/live-attendance?session=${session._id}`}>Open</Link>
          </article>)}</div>
          : <EmptyState title="No active sessions">Start attendance from an assigned timetable entry.</EmptyState>}
      </section>
      <section className="panel">
        <div className="panel-head"><div><p className="eyebrow">COMPLETED TODAY</p><h3>Recent sessions</h3></div></div>
        {recentSessions.loading ? <LoadingState label="Loading completed sessions" /> : recentSessions.error ? <ErrorState error={recentSessions.error} /> : (recentSessions.data || []).length
          ? <div className="session-list">{recentSessions.data.map((session) => <article className="session-item" key={session._id}>
            <div><strong>{session.subjectId?.name || session.subjectId?.code || 'Subject'}</strong><span>{session.classId?.name} / {session.classId?.section} · {session.startTime}</span></div>
            <StatusBadge value="CLOSED" />
          </article>)}</div>
          : <EmptyState title="No completed sessions today">Finished sessions will appear here.</EmptyState>}
      </section>
      <section className="panel">
        <div className="panel-head"><div><p className="eyebrow">TODAY</p><h3>Subject attendance</h3></div><Link className="text-link" to="/teacher/subject-reports">Reports →</Link></div>
        {report.loading ? <LoadingState label="Loading today's subject rates" /> : report.error ? <ErrorState error={report.error} /> : <SubjectBars subjects={report.data?.subjects} empty="No completed class sessions yet today." />}
      </section>
      <section className="panel">
        <div className="panel-head"><div><p className="eyebrow">RECENT MOVEMENTS</p><h3>Class activity</h3></div><Link className="text-link" to="/teacher/attendance-register">Register →</Link></div>
        <ActivityTable resource={activity} />
      </section>
    </div>
    {live.error && <p className="inline-error" role="alert">Live session details unavailable: {live.error}</p>}
  </>;
}

export function StudentDashboard({ history = false }) {
  const { user } = useAuth();
  const summary = useRequest(api.myAttendance);
  const timetable = useRequest(api.myTimetable);
  const subjects = summary.data?.subjects || [];
  const recentHistory = summary.data?.recentHistory || [];
  const overall = summary.data?.overall;

  return <>
    <PageIntro eyebrow={`STUDENT / ${history ? 'HISTORY' : 'OVERVIEW'}`} title={history ? 'Attendance history' : `Welcome, ${user?.name?.split(' ')[0] || 'student'}`}>
      <span>Your attendance is linked to your account. Rates include completed sessions only; unfinished sessions do not lower your percentage.</span>
    </PageIntro>
    {summary.error && <ErrorState error={summary.error} />}
    {!history && <div className="stat-grid">
      <StatCard label="Overall attendance" value={resourceValue(summary, (data) => formatPercentage(data?.overall?.attendancePercentage))} detail={overall?.completedClassCount ? `${overall.completedClassCount} completed sessions` : 'No completed sessions yet'} tone="green" />
      <StatCard label="Present" value={resourceValue(summary, (data) => data?.overall?.presentCount ?? 0)} detail="Completed sessions" tone="green" />
      <StatCard label="Absent" value={resourceValue(summary, (data) => data?.overall?.absentCount ?? 0)} detail="Completed sessions" tone="warm" />
      <StatCard label="Left early" value={resourceValue(summary, (data) => data?.overall?.leftEarlyCount ?? 0)} detail="Completed sessions" />
    </div>}
    {!history && <section className="panel student-subjects">
      <div className="panel-head"><div><p className="eyebrow">YOUR PROGRESS</p><h3>Subject attendance</h3></div></div>
      {summary.loading ? <LoadingState label="Loading your subject summaries" /> : summary.error ? null : subjects.length
        ? <div className="subject-bars">{subjects.map((item) => {
          const value = item.attendancePercentage;
          const rate = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
          const low = Number.isFinite(value) && value < 75;
          return <article className="student-subject" key={item.subject?._id}>
            <div className="student-subject-top"><div><strong>{item.subject?.name || item.subject?.code || 'Subject'}</strong><span>{low ? 'Below 75% target' : item.completedClassCount ? 'On track' : 'No completed sessions yet'}</span></div><strong className={low ? 'low-rate' : ''}>{formatPercentage(value)}</strong></div>
            <div className="progress-track" role="img" aria-label={`${item.subject?.name || 'Subject'} attendance ${formatPercentage(value)}`}><span className={`progress-fill ${low ? 'low' : ''}`} style={{ width: `${rate}%` }} /></div>
            <small>{item.presentCount} present · {item.absentCount} absent · {item.leftEarlyCount} left early · {item.completedClassCount} completed</small>
          </article>;
        })}</div>
        : <EmptyState title="No subject records yet">Subject summaries appear once the class schedule is connected.</EmptyState>}
    </section>}
    {!history && <section className="panel student-timetable">
      <div className="panel-head"><div><p className="eyebrow">CLASS SCHEDULE</p><h3>Your timetable</h3></div></div>
      {timetable.loading ? <LoadingState label="Loading your class timetable" /> : timetable.error ? <ErrorState error={timetable.error} /> : <DataTable columns={[
        { key: 'dayOfWeek', label: 'Day' },
        { key: 'time', label: 'Time', render: (row) => `${row.startTime}–${row.endTime}` },
        { key: 'subject', label: 'Subject', render: (row) => row.subjectId?.name || row.subjectId?.code || '—' },
        { key: 'teacher', label: 'Teacher', render: (row) => row.teacherId?.name || '—' },
        { key: 'room', label: 'Room', render: (row) => row.room || '—' }
      ]} rows={timetable.data || []} empty="No active timetable is available for your class" />}
    </section>}
    <section className="panel student-history">
      <div className="panel-head"><div><p className="eyebrow">RECENT RECORDS</p><h3>{history ? 'Attendance history' : 'Recent attendance'}</h3></div>{!history && <Link className="text-link" to="/student/history">View full history →</Link>}</div>
      {summary.loading ? <LoadingState label="Loading your attendance history" /> : summary.error ? null : <DataTable columns={[
        { key: 'date', label: 'Date', render: (row) => row.date ? new Date(row.date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—' },
        { key: 'subject', label: 'Subject', render: (row) => row.subject?.name || row.subject?.code || '—' },
        { key: 'status', label: 'Status', render: (row) => <StatusBadge value={row.status} /> },
        { key: 'class', label: 'Class', render: (row) => `${row.session?.classId?.name || '—'} / ${row.session?.classId?.section || '—'}` }
      ]} rows={history ? recentHistory : recentHistory.slice(0, 6)} empty="No completed attendance records yet" />}
    </section>
  </>;
}

export function StudentProfile() {
  const { user } = useAuth();
  return <>
    <PageIntro eyebrow="STUDENT / PROFILE" title="Student profile"><span>Your identity is provided by your authenticated school account.</span></PageIntro>
    <section className="panel profile-details"><p><strong>Name</strong><span>{user?.name || '—'}</span></p><p><strong>Email</strong><span>{user?.email || '—'}</span></p><p><strong>Role</strong><span>{user?.role || '—'}</span></p></section>
  </>;
}

export function AttendanceReports({ mode = 'admin' }) {
  const { user } = useAuth();
  const teacherMode = mode === 'teacher' || user?.role === 'TEACHER';
  const [filters, setFilters] = useState({ startDate: '', endDate: '', classId: '', subjectId: '', status: '' });
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const classes = useRequest(() => teacherMode ? api.timetables('?isActive=true') : api.classes('?isActive=true'));
  const subjects = useRequest(() => teacherMode ? api.timetables('?isActive=true') : api.subjects('?isActive=true'));
  const requestQuery = useMemo(() => queryString(filters), [filters]);
  const report = useRequest(() => api.attendanceReport(requestQuery), [requestQuery]);
  const classOptions = useMemo(() => teacherMode
    ? Array.from(new Map((classes.data || []).filter((item) => item.classId?._id).map((item) => [String(item.classId._id), item.classId])).values())
    : classes.data || [], [teacherMode, classes.data]);
  const subjectOptions = useMemo(() => teacherMode
    ? Array.from(new Map((subjects.data || []).filter((item) => item.subjectId?._id).map((item) => [String(item.subjectId._id), item.subjectId])).values())
    : subjects.data || [], [teacherMode, subjects.data]);
  const rows = (report.data?.records || []).filter((record) => {
    const term = search.trim().toLowerCase();
    return !term || record.studentId?.name?.toLowerCase().includes(term) || record.studentId?.rollNumber?.toLowerCase().includes(term);
  });
  const exportRows = () => {
    try {
      downloadCsv(`attendance-report-${localDateValue()}.csv`, recordsToCsv(rows));
      setError('');
    } catch (exportError) {
      setError(`Could not export CSV: ${exportError.message}`);
    }
  };
  const updateFilter = (field, value) => setFilters((current) => ({ ...current, [field]: value }));
  const heading = mode === 'register' ? 'Attendance register' : teacherMode ? 'Subject reports' : 'Attendance reports';

  return <>
    <PageIntro eyebrow={teacherMode ? 'TEACHING / ANALYTICS' : 'ADMIN / REPORTING'} title={heading} action={<button className="button secondary" onClick={exportRows} disabled={!rows.length}>Export CSV</button>}>
      <span>Completed sessions only. Attendance rates come from the backend and count PRESENT records over closed sessions; ABSENT and LEFT_EARLY are not attended.</span>
    </PageIntro>
    {filters.status && <p className="filter-note">The status filter narrows table rows and CSV export. Summary counts and percentages show all statuses in the selected date, class, and subject scope.</p>}
    {error && <p className="inline-error" role="alert">{error}</p>}
    <section className="filter-bar report-filters" aria-label="Attendance report filters">
      <label>From<input type="date" value={filters.startDate} onChange={(event) => updateFilter('startDate', event.target.value)} /></label>
      <label>To<input type="date" value={filters.endDate} onChange={(event) => updateFilter('endDate', event.target.value)} /></label>
      <label>Class<select value={filters.classId} onChange={(event) => updateFilter('classId', event.target.value)}><option value="">All classes</option>{classOptions.map((item) => <option key={item._id} value={item._id}>{item.name} / {item.section}</option>)}</select></label>
      <label>Subject<select value={filters.subjectId} onChange={(event) => updateFilter('subjectId', event.target.value)}><option value="">All subjects</option>{subjectOptions.map((item) => <option key={item._id} value={item._id}>{item.name || item.code}</option>)}</select></label>
      <label>Status<select value={filters.status} onChange={(event) => updateFilter('status', event.target.value)}><option value="">All completed statuses</option><option value="PRESENT">Present</option><option value="ABSENT">Absent</option><option value="LEFT_EARLY">Left early</option></select></label>
      <button className="button secondary" onClick={() => { setFilters({ startDate: '', endDate: '', classId: '', subjectId: '', status: '' }); setSearch(''); }}>Reset</button>
    </section>
    {report.error && <ErrorState error={report.error} />}
    {!report.error && <div className="stat-grid report-stats">
      <StatCard label="Present" value={resourceValue(report, (data) => data?.totals?.presentCount ?? 0)} tone="green" />
      <StatCard label="Absent" value={resourceValue(report, (data) => data?.totals?.absentCount ?? 0)} tone="warm" />
      <StatCard label="Left early" value={resourceValue(report, (data) => data?.totals?.leftEarlyCount ?? 0)} />
      <StatCard label="Overall attendance" value={resourceValue(report, (data) => formatPercentage(data?.totals?.attendancePercentage))} detail={report.data?.totals?.completedClassCount ? `${report.data.totals.completedClassCount} completed records` : 'No completed sessions in this range'} tone="green" />
    </div>}
    <section className="panel report-chart">
      <div className="panel-head"><div><p className="eyebrow">COMPLETED SESSIONS</p><h3>Subject comparison</h3></div></div>
      {report.loading ? <LoadingState label="Loading report analytics" /> : report.error ? null : <SubjectBars subjects={report.data?.subjects} />}
    </section>
    <section className="panel report-table">
      <div className="panel-head"><div><p className="eyebrow">STUDENT RECORDS</p><h3>{rows.length} records</h3></div><label className="search-field">Search<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name or roll number" /></label></div>
      {report.loading ? <LoadingState label="Loading completed attendance records" /> : report.error ? null : <DataTable columns={[
        { key: 'date', label: 'Date', render: (row) => row.date ? new Date(row.date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—' },
        { key: 'student', label: 'Student', render: (row) => <><strong>{row.studentId?.name || '—'}</strong><small className="table-subtext">{row.studentId?.rollNumber || ''}</small></> },
        { key: 'class', label: 'Class', render: (row) => `${row.sessionId?.classId?.name || '—'} / ${row.sessionId?.classId?.section || '—'}` },
        { key: 'subject', label: 'Subject', render: (row) => row.subjectId?.name || row.subjectId?.code || '—' },
        { key: 'status', label: 'Status', render: (row) => <StatusBadge value={row.finalStatus} /> }
      ]} rows={rows} empty="No completed attendance records match these filters" />}
    </section>
  </>;
}
