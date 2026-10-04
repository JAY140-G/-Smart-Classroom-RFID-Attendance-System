export function formatPercentage(value) {
  return Number.isFinite(value) ? `${value.toFixed(1)}%` : '—';
}

export function localDateValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function safeCsvValue(value) {
  const text = value == null ? '' : String(value);
  let prefixIndex = 0;
  while (prefixIndex < text.length) {
    const character = text[prefixIndex];
    const code = text.charCodeAt(prefixIndex);
    if (/[=+\-@]/.test(character)) break;
    if (!/\s/u.test(character) && code >= 32 && code !== 127) {
      prefixIndex = text.length;
      break;
    }
    prefixIndex += 1;
  }
  const safe = /[=+\-@]/.test(text[prefixIndex] || '') ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function recordsToCsv(records) {
  const rows = [
    ['Date', 'Student', 'Roll number', 'Class', 'Subject', 'Status'],
    ...records.map((record) => [
      record.date ? new Date(record.date).toISOString() : '',
      record.studentId?.name,
      record.studentId?.rollNumber,
      record.sessionId?.classId
        ? `${record.sessionId.classId.name || ''} ${record.sessionId.classId.section || ''}`.trim()
        : '',
      record.subjectId?.name || record.subjectId?.code,
      record.finalStatus
    ])
  ];
  return rows.map((row) => row.map(safeCsvValue).join(',')).join('\r\n');
}

export function downloadCsv(filename, csv) {
  const link = document.createElement('a');
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
