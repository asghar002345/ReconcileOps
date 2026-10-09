import { useId, useRef, useState, type FormEvent } from 'react';
import { ApiError, importCsv, type ImportPhase } from '../api/client';
import type { ImportBatchSummary, ImportRowError } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { StatusBanner } from '../components/StatusBanner';
import {
  MAX_CSV_BYTES_LABEL,
  validateCsvFile,
} from '../lib/uploadValidation';
import { userFacingError } from '../lib/userFacingError';
import './Pages.css';

type Kind = 'payments' | 'bank-entries';

const KIND_HELP: Record<Kind, string> = {
  payments:
    'Required columns typically include source payment id, reference, gross and fee amounts in fils, currency, and paid-at timestamp.',
  'bank-entries':
    'Required columns typically include bank entry id, reference, settled amount in fils, currency, and settled-at timestamp.',
};

export function ImportPage() {
  const { token } = useAuth();
  const fileErrorId = useId();
  const helpId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<Kind>('payments');
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<ImportPhase | null>(null);
  const [result, setResult] = useState<ImportBatchSummary | null>(null);
  const [errors, setErrors] = useState<ImportRowError[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const submitting = phase !== null;

  function onFileChange(next: File | null) {
    setFile(next);
    setResult(null);
    setMessage(null);
    setErrors([]);
    if (!next) {
      setFileError(null);
      return;
    }
    const check = validateCsvFile(next);
    setFileError(check.ok ? null : check.message);
  }

  async function runImport() {
    if (!token || submitting) return;
    const check = validateCsvFile(file);
    if (!check.ok) {
      setFileError(check.message);
      return;
    }
    if (!file) return;

    setPhase('uploading');
    setResult(null);
    setErrors([]);
    setMessage(null);
    try {
      const summary = await importCsv(token, kind, file, {
        onPhase: setPhase,
      });
      setResult(summary);
      setMessage(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return;
      if (err instanceof ApiError) {
        setMessage(userFacingError(err, 'Import did not complete.'));
        setErrors(err.body.errors ?? []);
      } else {
        setMessage(userFacingError(err, 'Import did not complete.'));
      }
    } finally {
      setPhase(null);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void runImport();
  }

  function clearFile() {
    setFile(null);
    setFileError(null);
    setResult(null);
    setMessage(null);
    setErrors([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  return (
    <div className="page">
      <header className="page__header">
        <div>
          <p className="page__eyebrow">Data intake</p>
          <h1>Import CSV</h1>
        </div>
      </header>

      <p className="page__lead">
        Upload a payments or bank-entries CSV to publish rows into this
        workspace. The file must be UTF-8 CSV, up to {MAX_CSV_BYTES_LABEL}. The
        server validates headers and every row before anything is published.
      </p>

      <form className="import-form" onSubmit={onSubmit} noValidate>
        <label htmlFor="import-kind">
          Import type
          <select
            id="import-kind"
            value={kind}
            disabled={submitting}
            onChange={(e) => {
              setKind(e.target.value as Kind);
              setResult(null);
              setMessage(null);
              setErrors([]);
            }}
            aria-describedby={helpId}
          >
            <option value="payments">Payments</option>
            <option value="bank-entries">Bank entries</option>
          </select>
        </label>

        <p id={helpId} className="import-form__help">
          {KIND_HELP[kind]}
        </p>

        <label htmlFor="import-file">
          CSV file
          <input
            ref={fileInputRef}
            id="import-file"
            type="file"
            accept=".csv,text/csv"
            disabled={submitting}
            onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
            required
            aria-invalid={fileError ? true : undefined}
            aria-describedby={fileError ? fileErrorId : undefined}
          />
        </label>

        {file ? (
          <p className="import-form__file tabular">
            Selected: <strong>{file.name}</strong>
            {' · '}
            {(file.size / 1024).toFixed(1)} KB
            {!submitting ? (
              <>
                {' · '}
                <button
                  type="button"
                  className="linkish"
                  onClick={clearFile}
                >
                  Clear
                </button>
              </>
            ) : null}
          </p>
        ) : (
          <p className="import-form__help">Choose a <code>.csv</code> file to continue.</p>
        )}

        {fileError ? (
          <p id={fileErrorId} className="field-error" role="alert">
            {fileError}
          </p>
        ) : null}

        <button
          type="submit"
          className="action"
          disabled={!file || submitting || Boolean(fileError)}
          aria-busy={submitting || undefined}
        >
          {phase === 'uploading'
            ? 'Uploading…'
            : phase === 'processing'
              ? 'Processing on server…'
              : 'Upload and publish'}
        </button>
      </form>

      {phase === 'uploading' ? (
        <StatusBanner tone="info" title="Uploading file">
          Sending the CSV to the API. Keep this tab open until the upload
          finishes.
        </StatusBanner>
      ) : null}

      {phase === 'processing' ? (
        <StatusBanner tone="info" title="Processing import">
          The file was accepted and is being published. This is not complete
          until the server confirms the batch.
        </StatusBanner>
      ) : null}

      {result ? (
        <StatusBanner
          tone={result.reused ? 'warning' : 'success'}
          title={
            result.reused
              ? 'This exact file was already imported'
              : 'Import published'
          }
        >
          <ul className="result-list">
            <li>
              {result.reused
                ? 'No new rows were written because the content hash already exists.'
                : 'Rows are available for payments, reconciliation, and review.'}
            </li>
            <li>
              Batch <span className="tabular">{result.batchId}</span>
            </li>
            <li>
              Type: {result.kind === 'bank_entries' ? 'Bank entries' : 'Payments'}
            </li>
            <li>
              Rows published:{' '}
              <span className="tabular">{result.rowCount}</span>
            </li>
            <li className="tabular wrap-anywhere">
              Content hash: {result.fileHashSha256}
            </li>
          </ul>
        </StatusBanner>
      ) : null}

      {message && !result ? (
        <StatusBanner tone="danger" title={message}>
          {errors.length > 0 ? (
            <>
              <p className="banner-extra">
                Fix the rows below and upload again. Your selected file is still
                available for retry.
              </p>
              <ul className="result-list">
                {errors.map((err) => (
                  <li key={`${err.rowNumber}-${err.field}-${err.message}`}>
                    Row {err.rowNumber}
                    {err.field ? ` · ${err.field}` : ''}: {err.message}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="banner-extra">
              Your selected file is still available. Adjust the CSV if needed,
              then try Upload and publish again.
            </p>
          )}
          <div className="button-row">
            <button
              type="button"
              className="action"
              disabled={!file || Boolean(fileError) || submitting}
              onClick={() => void runImport()}
            >
              Retry upload
            </button>
          </div>
        </StatusBanner>
      ) : null}
    </div>
  );
}
