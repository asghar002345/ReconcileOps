import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ApiError,
  createInvestigation,
  fetchLatestReconciliation,
  filsToAed,
  runReconciliation,
} from '../api/client';
import type { MatchOutcome, ReconciliationRunView } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { StatusBanner } from '../components/StatusBanner';
import './Pages.css';

const OUTCOMES: MatchOutcome[] = [
  'MATCHED',
  'AMOUNT_MISMATCH',
  'PAYMENT_WITHOUT_BANK_ENTRY',
  'BANK_ENTRY_WITHOUT_PAYMENT',
  'AMBIGUOUS',
  'OUTSIDE_SETTLEMENT_WINDOW',
];

export function ReconciliationPage() {
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const [run, setRun] = useState<ReconciliationRunView | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<MatchOutcome | 'ALL'>('ALL');

  const loadLatest = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const latest = await fetchLatestReconciliation(token);
      setRun(latest);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setRun(null);
      } else {
        setError(err instanceof ApiError ? err.message : 'Failed to load');
      }
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadLatest();
  }, [loadLatest]);

  async function onRun() {
    if (!token) return;
    setRunning(true);
    setError(null);
    try {
      const next = await runReconciliation(token);
      setRun(next);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Run failed');
    } finally {
      setRunning(false);
    }
  }

  async function onOpenInvestigation(resultId: string) {
    if (!token) return;
    setOpeningId(resultId);
    setError(null);
    try {
      const created = await createInvestigation(token, resultId);
      navigate(`/investigations/${created.id}`);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Could not open investigation',
      );
    } finally {
      setOpeningId(null);
    }
  }

  const rows =
    run?.results.filter(
      (row) => filter === 'ALL' || row.outcome === filter,
    ) ?? [];

  return (
    <div className="page">
      <header className="page__header">
        <div>
          <p className="page__eyebrow">Week 7 async matcher</p>
          <h1>Reconciliation</h1>
        </div>
        <button
          type="button"
          className="action"
          onClick={() => void onRun()}
          disabled={running}
        >
          {running ? 'Running…' : 'Run reconciliation'}
        </button>
      </header>

      <p className="page__note">
        Exact reference + AED net + 3-day settlement window. Rule version{' '}
        <code>exact-ref-net-window-v1</code>. See{' '}
        <code>docs/reconciliation-learning.md</code>.
      </p>

      {loading ? <StatusBanner tone="info" title="Loading latest run…" /> : null}
      {error ? <StatusBanner tone="danger" title={error} /> : null}

      {!loading && !run ? (
        <StatusBanner tone="info" title="No run yet">
          Click Run reconciliation to classify the current workspace snapshot.
        </StatusBanner>
      ) : null}

      {run ? (
        <>
          <section className="metric-row metric-row--dense">
            {OUTCOMES.map((outcome) => (
              <button
                key={outcome}
                type="button"
                className={`metric metric--click ${filter === outcome ? 'metric--active' : ''}`}
                onClick={() =>
                  setFilter((current) =>
                    current === outcome ? 'ALL' : outcome,
                  )
                }
              >
                <p className="metric__label">{outcome}</p>
                <p className="metric__value tabular">{run.summary[outcome]}</p>
              </button>
            ))}
          </section>

          <p className="page__meta tabular">
            Run {run.id} · {new Date(run.createdAt).toISOString()} ·{' '}
            {run.resultCount} results
            {filter !== 'ALL' ? ` · filter ${filter}` : ''}
          </p>

          {rows.length === 0 ? (
            <StatusBanner tone="info" title="No results in this filter" />
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Reference</th>
                    <th>Outcome</th>
                    <th className="num">Expected net</th>
                    <th className="num">Settled</th>
                    <th className="num">Difference</th>
                    <th>Reason</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td>{row.referenceNormalized}</td>
                      <td>{row.outcome}</td>
                      <td className="num tabular">
                        {row.expectedNetFils
                          ? filsToAed(row.expectedNetFils)
                          : '—'}
                      </td>
                      <td className="num tabular">
                        {row.actualSettledFils
                          ? filsToAed(row.actualSettledFils)
                          : '—'}
                      </td>
                      <td className="num tabular">
                        {row.differenceFils
                          ? filsToAed(row.differenceFils)
                          : '—'}
                      </td>
                      <td className="wrap">{row.reason}</td>
                      <td>
                        {user?.role === 'analyst' &&
                        row.outcome !== 'MATCHED' ? (
                          <button
                            type="button"
                            className="action action--ghost"
                            disabled={openingId === row.id}
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
