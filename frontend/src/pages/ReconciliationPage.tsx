import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ApiError,
  createInvestigation,
  fetchLatestReconciliation,
  runReconciliation,
} from '../api/client';
import type { MatchOutcome, ReconciliationRunView } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { StatusBanner } from '../components/StatusBanner';
import { formatAed, formatDateTime } from '../lib/format';
import {
  OUTCOME_ORDER,
  outcomeLabel,
  outcomeShortLabel,
  outcomeTableLabel,
  outcomeTone,
} from '../lib/outcomes';
import { userFacingError } from '../lib/userFacingError';
import './Pages.css';

function filterFromSearch(params: URLSearchParams): MatchOutcome | 'ALL' {
  const raw = params.get('outcome');
  if (raw && (OUTCOME_ORDER as string[]).includes(raw)) {
    return raw as MatchOutcome;
  }
  return 'ALL';
}

export function ReconciliationPage() {
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const filter = filterFromSearch(searchParams);
  const [run, setRun] = useState<ReconciliationRunView | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successNote, setSuccessNote] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const loadLatest = useCallback(async () => {
    if (!token) return;
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const latest = await fetchLatestReconciliation(token);
      if (requestId !== requestIdRef.current) return;
      setRun(latest);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      if (err instanceof ApiError && err.status === 401) return;
      if (err instanceof ApiError && err.status === 404) {
        setRun(null);
      } else {
        setError(userFacingError(err, 'Could not load the latest reconciliation run.'));
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [token]);

  useEffect(() => {
    void loadLatest();
  }, [loadLatest]);

  async function onRun() {
    if (!token || running) return;
    setRunning(true);
    setError(null);
    setSuccessNote(null);
    try {
      const next = await runReconciliation(token);
      setRun(next);
      setSuccessNote(
        `Reconciliation finished with ${next.resultCount} result${next.resultCount === 1 ? '' : 's'}.`,
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return;
      setError(userFacingError(err, 'Reconciliation did not finish. Try again.'));
    } finally {
      setRunning(false);
    }
  }

  async function onOpenInvestigation(resultId: string) {
    if (!token || openingId) return;
    setOpeningId(resultId);
    setError(null);
    try {
      const created = await createInvestigation(token, resultId);
      navigate(`/investigations/${created.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return;
      setError(
        userFacingError(
          err,
          'Could not open an investigation for this result.',
        ),
      );
    } finally {
      setOpeningId(null);
    }
  }

  function setFilter(outcome: MatchOutcome | 'ALL') {
    if (outcome === 'ALL') {
      setSearchParams({}, { replace: false });
    } else {
      setSearchParams({ outcome }, { replace: false });
    }
  }

  const rows =
    run?.results.filter(
      (row) => filter === 'ALL' || row.outcome === filter,
    ) ?? [];

  const showInitialLoading = loading && !run;

  return (
    <div className="page">
      <header className="page__header">
        <div>
          <p className="page__eyebrow">Matching</p>
          <h1>Reconciliation</h1>
        </div>
        <div className="button-row">
          {run && !loading ? (
            <button
              type="button"
              className="action action--ghost"
              onClick={() => void loadLatest()}
              disabled={running || loading}
            >
              Refresh
            </button>
          ) : null}
          <button
            type="button"
            className="action"
            onClick={() => void onRun()}
            disabled={running}
            aria-busy={running || undefined}
          >
            {running ? 'Running…' : run ? 'Run again' : 'Run reconciliation'}
          </button>
        </div>
      </header>

      <p className="page__lead">
        Match workspace payments to bank entries using the payment reference,
        expected AED net, and a three-day settlement window. Results stay on
        this page until the server confirms a new run.
      </p>

      {showInitialLoading ? (
        <StatusBanner tone="info" title="Loading the latest run…" />
      ) : null}

      {running ? (
        <StatusBanner tone="info" title="Reconciliation in progress">
          Matching the current workspace snapshot. Previous results stay visible
          until this run succeeds.
        </StatusBanner>
      ) : null}

      {error ? (
        <StatusBanner tone="danger" title={error}>
          <div className="button-row">
            <button
              type="button"
              className="action action--ghost"
              onClick={() => void loadLatest()}
              disabled={loading || running}
            >
              Reload latest run
            </button>
            <button
              type="button"
              className="action"
              onClick={() => void onRun()}
              disabled={running}
            >
              Try running again
            </button>
          </div>
        </StatusBanner>
      ) : null}

      {successNote && !error ? (
        <StatusBanner tone="success" title={successNote} />
      ) : null}

      {!loading && !run && !running ? (
        <StatusBanner tone="info" title="No reconciliation run yet">
          Import payments and bank entries, then run reconciliation to classify
          matched, mismatched, and unmatched references.
        </StatusBanner>
      ) : null}

      {run ? (
        <>
          <section
            className="filter-chips"
            aria-label="Filter results by outcome"
          >
            <button
              type="button"
              className={`filter-chip ${filter === 'ALL' ? 'filter-chip--active' : ''}`}
              aria-pressed={filter === 'ALL'}
              aria-label={`All outcomes, ${run.resultCount}`}
              onClick={() => setFilter('ALL')}
            >
              <span className="filter-chip__label" aria-hidden="true">
                All
              </span>
              <span className="filter-chip__count tabular" aria-hidden="true">
                {run.resultCount}
              </span>
            </button>
            {OUTCOME_ORDER.map((outcome) => {
              const selected = filter === outcome;
              const count = run.summary[outcome];
              return (
                <button
                  key={outcome}
                  type="button"
                  className={`filter-chip filter-chip--${outcomeTone(outcome)} ${selected ? 'filter-chip--active' : ''}`}
                  aria-pressed={selected}
                  aria-label={`${outcomeLabel(outcome)}, ${count}`}
                  title={outcomeLabel(outcome)}
                  onClick={() => setFilter(selected ? 'ALL' : outcome)}
                >
                  <span className="filter-chip__label" aria-hidden="true">
                    <span className="filter-chip__full">{outcomeLabel(outcome)}</span>
                    <span className="filter-chip__short">
                      {outcomeShortLabel(outcome)}
                    </span>
                  </span>
                  <span className="filter-chip__count tabular" aria-hidden="true">
                    {count}
                  </span>
                </button>
              );
            })}
          </section>

          <p className="recon-meta tabular">
            <span>
              Run started <strong>{formatDateTime(run.createdAt)}</strong>
            </span>
            <span>
              <strong>{run.resultCount}</strong>{' '}
              result{run.resultCount === 1 ? '' : 's'}
            </span>
            {filter !== 'ALL' ? (
              <span>Showing {outcomeLabel(filter).toLowerCase()}</span>
            ) : null}
          </p>

          {rows.length === 0 ? (
            <StatusBanner tone="info" title="No results for this filter">
              Choose another outcome, or select All to see every result from this
              run.
            </StatusBanner>
          ) : (
            <div className="table-wrap" aria-busy={running || undefined}>
              <table className="data-table data-table--recon">
                <caption className="sr-only">
                  Reconciliation results in AED
                  {filter !== 'ALL' ? ` filtered by ${outcomeLabel(filter)}` : ''}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Reference</th>
                    <th scope="col">Outcome</th>
                    <th scope="col" className="num">
                      Expected
                    </th>
                    <th scope="col" className="num">
                      Settled
                    </th>
                    <th scope="col" className="num">
                      Diff
                    </th>
                    <th scope="col">Reason</th>
                    <th scope="col">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td
                        className="cell-ref"
                        title={row.referenceNormalized || undefined}
                      >
                        {row.referenceNormalized || '—'}
                      </td>
                      <td className="cell-outcome">
                        <span
                          className={`status-pill status-pill--${outcomeTone(row.outcome)}`}
                          title={outcomeLabel(row.outcome)}
                        >
                          {outcomeTableLabel(row.outcome)}
                        </span>
                      </td>
                      <td className="num tabular">
                        {formatAed(row.expectedNetFils)}
                      </td>
                      <td className="num tabular">
                        {formatAed(row.actualSettledFils)}
                      </td>
                      <td className="num tabular">
                        {formatAed(row.differenceFils)}
                      </td>
                      <td className="cell-reason">
                        <span className="cell-reason__text" title={row.reason}>
                          {row.reason}
                        </span>
                      </td>
                      <td className="cell-actions">
                        {user?.role === 'analyst' &&
                        row.outcome !== 'MATCHED' ? (
                          <button
                            type="button"
                            className="action action--ghost action--compact"
                            disabled={
                              openingId === row.id ||
                              Boolean(openingId) ||
                              running
                            }
                            onClick={() => void onOpenInvestigation(row.id)}
                          >
                            {openingId === row.id ? 'Opening…' : 'Investigate'}
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
