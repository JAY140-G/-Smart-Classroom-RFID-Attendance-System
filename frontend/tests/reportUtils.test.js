import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatPercentage, recordsToCsv } from '../src/reportUtils.js';

test('percentage formatting distinguishes zero from unavailable values', () => {
  assert.equal(formatPercentage(0), '0.0%');
  assert.equal(formatPercentage(73.56), '73.6%');
  assert.equal(formatPercentage(null), '—');
});

test('CSV export quotes delimiters and neutralizes spreadsheet formula prefixes', () => {
  const csv = recordsToCsv([{
    date: '2026-10-04T10:30:00.000Z',
    studentId: { name: '=HYPERLINK("x")', rollNumber: 'R,01' },
    sessionId: { classId: { name: 'Class "A"', section: '1' } },
    subjectId: { name: 'Science, Lab' },
    finalStatus: 'PRESENT'
  }]);
  const lines = csv.split('\r\n');

  assert.equal(lines[0], '"Date","Student","Roll number","Class","Subject","Status"');
  assert.ok(lines[1].includes(`"'=HYPERLINK(""x"")"`));
  assert.ok(lines[1].includes('"R,01"'));
  assert.ok(lines[1].includes('"Class ""A"" 1"'));
  assert.ok(lines[1].endsWith('"PRESENT"'));

  const newlineFormula = recordsToCsv([{
    studentId: { name: '\n=SUM(1,1)' },
    finalStatus: 'ABSENT'
  }]);
  assert.ok(newlineFormula.includes(`"'\n=SUM(1,1)"`));
});
