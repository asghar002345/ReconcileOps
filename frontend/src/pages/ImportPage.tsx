import { useState, type FormEvent } from 'react';
import { ApiError, importCsv } from '../api/client';
import type { ImportBatchSummary, ImportRowError } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { StatusBanner } from '../components/StatusBanner';
import './Pages.css';

type Kind = 'payments' | 'bank-entries';

export function ImportPage() {
  const { token } = useAuth();
  const [kind, setKind] = useState<Kind>('payments');
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ImportBatchSummary | null>(null);
  const [errors, setErrors] = useState<ImportRowError[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!token || !file) return;
    setSubmitting(true);
    setResult(null);
    setErrors([]);
    setMessage(null);
    try {
      const summary = await importCsv(token, kind, file);
      setResult(summary);
    } catch (err) {
      if (err instanceof ApiError) {
        setMessage(err.message);
        setErrors(err.body.errors ?? []);
      } else {
        setMessage('Import failed');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page">
      <header className="page__header">
        <div>
          <p className="page__eyebrow">Day 2</p>
          <h1>Import CSV</h1>
        </div>
      </header>

      <form className="import-form" onSubmit={onSubmit}>
        <label>
          File type
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as Kind)}
          >
            <option value="payments">Payments</option>
            <option value="bank-entries">Bank entries</option>
          </select>
        </label>
        <label>
          CSV file
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            required
          />
        </label>
        <button type="submit" disabled={!file || submitting}>
          {submitting ? 'Queuing / processing…' : 'Upload and publish'}
        </button>
      </form>

      <p className="page__note">
        Valid files are queued (Week 7 worker). Invalid rows still fail
        immediately with HTTP 400. Same bytes → <code>reused: true</code>.
      </p>

      {result ? (
        <StatusBanner
          tone={result.reused ? 'warning' : 'success'}
          title={
            result.reused
              ? 'Identical file already imported'
              : 'Batch published'
          }
        >
          <ul className="result-list">
            <li>Batch: {result.batchId}</li>
            <li>Kind: {result.kind}</li>
            <li>Rows: {result.rowCount}</li>
            <li className="tabular">Hash: {result.fileHashSha256}</li>
          </ul>
        </StatusBanner>
      ) : null}

      {message && !result ? (
        <StatusBanner tone="danger" title={message}>
          {errors.length > 0 ? (
            <ul className="result-list">
              {errors.map((err) => (
                <li key={`${err.rowNumber}-${err.field}-${err.message}`}>
                  Row {err.rowNumber} · {err.field}: {err.message}
                </li>
              ))}
            </ul>
          ) : null}
        </StatusBanner>
      ) : null}
    </div>
  );
}
