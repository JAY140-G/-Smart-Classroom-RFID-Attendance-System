import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import api from './services/api';
import { DataTable, EmptyState, ErrorState, LoadingState, PageIntro, StatusBadge } from './components';
import './virtualRfid.css';

const ACTIVE_STATUSES = new Set(['WAITING_CAMERA', 'PROCESSING']);

function uuidV4() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function statusLabel(scan) {
  if (!scan) return 'READY';
  if (scan.status === 'WAITING_CAMERA') return 'WAITING FOR CAMERA';
  if (scan.status === 'PROCESSING') return 'VERIFYING FACE';
  if (scan.status === 'SUCCEEDED') return 'SCAN ACCEPTED';
  if (scan.status === 'FAILED') return 'REJECTED';
  if (scan.status === 'EXPIRED') return 'EXPIRED';
  return scan.status;
}

export function VirtualRfidConsole() {
  const [students, setStudents] = useState([]);
  const [studentsLoading, setStudentsLoading] = useState(true);
  const [studentsError, setStudentsError] = useState('');
  const [history, setHistory] = useState([]);
  const [historyError, setHistoryError] = useState('');
  const [selectedVirtualUid, setSelectedVirtualUid] = useState('');
  const [scan, setScan] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [requestError, setRequestError] = useState('');
  const [pollError, setPollError] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewError, setPreviewError] = useState('');
  const [previewScanId, setPreviewScanId] = useState('');
  const submissionLock = useRef(false);

  const selectedStudent = useMemo(
    () => students.find((student) => student.virtualRfidUid === selectedVirtualUid) || null,
    [students, selectedVirtualUid]
  );

  const loadRoster = async () => {
    setStudentsLoading(true);
    setStudentsError('');
    try {
      const result = await api.virtualScanStudents();
      setStudents(result.data || []);
    } catch (error) {
      setStudentsError(error.message);
    } finally {
      setStudentsLoading(false);
    }
  };

  const loadHistory = async () => {
    setHistoryError('');
    try {
      const result = await api.recentLiveScans();
      setHistory(result.data || []);
    } catch (error) {
      setHistoryError(error.message);
    }
  };

  useEffect(() => {
    let active = true;
    api.virtualScanStudents()
      .then((result) => {
        if (active) setStudents(result.data || []);
      })
      .catch((error) => {
        if (active) setStudentsError(error.message);
      })
      .finally(() => {
        if (active) setStudentsLoading(false);
      });
    api.recentLiveScans()
      .then((result) => {
        if (active) setHistory(result.data || []);
      })
      .catch((error) => {
        if (active) setHistoryError(error.message);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  useEffect(() => {
    if (!scan?.scanId || !ACTIVE_STATUSES.has(scan.status)) return undefined;
    let cancelled = false;
    let timer;

    const poll = async () => {
      try {
        const result = await api.virtualScanStatus(scan.scanId);
        if (cancelled) return;
        setPollError('');
        setScan(result.data);
        if (ACTIVE_STATUSES.has(result.data.status)) {
          timer = setTimeout(poll, 1000);
        } else {
          loadHistory();
        }
      } catch (error) {
        if (cancelled) return;
        setPollError(error.message);
        timer = setTimeout(poll, 2000);
      }
    };

    timer = setTimeout(poll, 800);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [scan?.scanId, scan?.status]);

  const startScan = async () => {
    if (!selectedStudent || !selectedStudent.faceEnrolled || submissionLock.current) return;
    if (
      scan?.status === 'SUCCEEDED'
      && !window.confirm('This starts a new attendance movement scan for the selected student. Continue?')
    ) return;
    submissionLock.current = true;
    setSubmitting(true);
    setRequestError('');
    setPollError('');
    setScan(null);
    try {
      const result = await api.createVirtualScan(
        selectedStudent.virtualRfidUid,
        uuidV4()
      );
      setScan(result.data);
      loadHistory();
    } catch (error) {
      setRequestError(error.message);
    } finally {
      submissionLock.current = false;
      setSubmitting(false);
    }
  };

  const pending = Boolean(scan && ACTIVE_STATUSES.has(scan.status));
  const openImage = async (record) => {
    setPreviewUrl('');
    setPreviewError('');
    setPreviewScanId(record.scanId);
    try {
      const image = await api.liveScanImage(record.scanId);
      setPreviewUrl(URL.createObjectURL(image));
    } catch (error) {
      setPreviewError(error.message);
    }
  };
  const canStart = Boolean(selectedStudent?.faceEnrolled && !pending && !submitting);
  const message = scan?.status === 'FAILED'
    ? scan.result?.message || 'The live face check failed. Attendance was not recorded.'
    : scan?.status === 'EXPIRED'
      ? 'No camera capture was received before the request expired. Attendance was not recorded.'
      : scan?.status === 'SUCCEEDED'
        ? `${scan.result?.eventType || 'Attendance movement'} accepted; current state is ${scan.result?.currentState || 'updated'}.`
        : scan?.status === 'PROCESSING'
          ? 'The backend received an image and is running real face verification.'
          : scan?.status === 'WAITING_CAMERA'
            ? 'Waiting for the ESP32-CAM to capture and upload a fresh image.'
            : 'Select an enrolled student to begin a virtual card scan.';

  return <div className="virtual-console">
    <PageIntro eyebrow="ADMIN / DEVELOPMENT INPUT" title="Virtual RFID console">
      <span>Simulates only the card UID. A real fresh camera image and server-side face match are still required before attendance can change.</span>
    </PageIntro>

    <section className="virtual-warning" role="note" aria-label="Virtual mode warning">
      <strong>VIRTUAL MODE — NOT A PHYSICAL CARD SCAN</strong>
      <span>This tool does not simulate, bypass, or approve face verification. Biometric liveness detection is not claimed.</span>
    </section>

    <section className="panel virtual-scan-panel">
      <div className="virtual-student-picker">
        <label htmlFor="virtual-student">Student record from MongoDB</label>
        {studentsLoading
          ? <LoadingState label="Loading students from backend" />
          : studentsError
            ? <ErrorState error={studentsError} onRetry={loadRoster} />
            : students.length
              ? <select
                id="virtual-student"
                value={selectedVirtualUid}
                disabled={pending || submitting}
                onChange={(event) => {
                  setSelectedVirtualUid(event.target.value);
                  setScan(null);
                  setRequestError('');
                  setPollError('');
                }}
              >
                <option value="">Choose a student</option>
                {students.map((student) => (
                  <option key={student.studentId} value={student.virtualRfidUid}>
                    {student.name} · {student.rollNumber}
                  </option>
                ))}
              </select>
              : <EmptyState title="No active student records">Create or activate a real student record before assigning a virtual UID.</EmptyState>}
      </div>

      {selectedStudent && <div className="virtual-student-summary">
        <div><span>Selected student</span><strong>{selectedStudent.name} · {selectedStudent.rollNumber}</strong></div>
        <div><span>Virtual UID</span><code>{selectedStudent.virtualRfidUid}</code></div>
        <div><span>Face enrollment</span><StatusBadge value={selectedStudent.faceEnrolled ? 'ACTIVE' : 'MISSING'} /></div>
      </div>}

      {selectedStudent && !selectedStudent.faceEnrolled && (
        <p className="virtual-error" role="alert">This student has no active face enrollment. Add a genuine enrollment before attempting attendance.</p>
      )}

      <div className="virtual-scan-actions">
        <button className="button primary" disabled={!canStart} onClick={startScan}>
          {submitting
            ? 'Creating scan request…'
            : pending
              ? 'Camera verification pending…'
              : scan?.status === 'SUCCEEDED'
                ? 'Start another movement scan'
                : scan
                  ? 'Retry with a new scan'
                  : 'Scan Virtual Card'}
        </button>
        <Link className="button secondary" to="/admin/live-attendance">Open live attendance</Link>
      </div>

      {(requestError || pollError) && <p className="virtual-error" role="alert">{requestError || `Status polling error: ${pollError}`}</p>}
      <div className="virtual-status" aria-live="polite">
        <div className="virtual-status-head">
          <div><span>Actual scan state</span><strong>{statusLabel(scan)}</strong></div>
          {scan?.source && <StatusBadge value={scan.source} />}
        </div>
        <p>{message}</p>
        {scan?.scanId && <small>Scan ID: <code>{scan.scanId}</code> · Protocol v{scan.protocolVersion || 1}</small>}
      </div>
    </section>

    <section className="panel virtual-history-panel">
      <div className="panel-head">
        <div><p className="eyebrow">BACKEND RECORDS</p><h3>Recent physical and virtual scans</h3></div>
        <button className="button secondary" onClick={loadHistory}>Refresh</button>
      </div>
      {historyError
        ? <ErrorState error={historyError} onRetry={loadHistory} />
        : <DataTable
          columns={[
            { key: 'student', label: 'Student', render: (row) => <>{row.student?.name || 'Student'}<small className="table-subtext">{row.student?.rollNumber || ''}</small></> },
            { key: 'source', label: 'Source', render: (row) => <StatusBadge value={row.source || 'RFID'} /> },
            { key: 'status', label: 'State', render: (row) => <StatusBadge value={row.status} /> },
            { key: 'result', label: 'Result', render: (row) => row.result?.message || (row.status === 'WAITING_CAMERA' ? 'Waiting for camera' : row.status === 'PROCESSING' ? 'Face verification running' : '—') },
            { key: 'createdAt', label: 'Started', render: (row) => row.createdAt ? new Date(row.createdAt).toLocaleString() : '—' },
            { key: 'image', label: 'Captured image', render: (row) => row.imageAvailable
              ? <button className="table-action" onClick={() => openImage(row)}>View</button>
              : <span className="table-subtext">Not retained / expired</span> }
          ]}
          rows={history}
          empty="No live scans have been requested"
        />}
    </section>
    {(previewUrl || previewError) && <div className="scan-image-overlay" role="dialog" aria-modal="true" aria-label="Captured scan image">
      <div className="scan-image-preview">
        <div className="panel-head">
          <div><p className="eyebrow">RESTRICTED ADMIN PREVIEW</p><h3>ESP32-CAM captured image</h3></div>
          <button className="button secondary" onClick={() => { setPreviewUrl(''); setPreviewError(''); }}>Close</button>
        </div>
        {previewError
          ? <p className="virtual-error" role="alert">{previewError}</p>
          : <img src={previewUrl} alt={`Actual ESP32-CAM image for scan ${previewScanId}`} />}
        <small>Images are removed automatically after the configured retention period.</small>
      </div>
    </div>}
  </div>;
}
