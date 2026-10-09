import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ApiError,
  fetchLatestReconciliation,
  filsToAed,
  listPayments,
} from '../api/client';
import type { ReconciliationRunView } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { StatusBanner } from '../components/StatusBanner';
import { userFacingError } from '../lib/userFacingError';
import './Pages.css';

export function OverviewPage() {
  const { token, user } = useAuth();
  const [totalPayments, setTotalPayments] = useState<number | null>(null);
  const [sampleNet, setSampleNet] = useState<string | null>(null);
  const [latestRun, setLatestRun] = useState<ReconciliationRunView | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();

    async function load() {
      if (hasLoadedRef.current) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const page = await listPayments(token!, 1, 5, controller.signal);
        if (controller.signal.aborted) return;
        setTotalPayments(page.totalItems);
        const first = page.items[0];
        if (first) {
          const net =
            BigInt(first.grossAmountFils) - BigInt(first.feeAmountFils);
          setSampleNet(filsToAed(net.toString()));
        } else {
          setSampleNet(null);
        }
        try {
          const run = await fetchLatestReconciliation(
            token!,
            controller.signal,
          );
          if (!controller.signal.aborted) setLatestRun(run);
        } catch (err) {
          if (err instanceof ApiError && err.status === 404) {
            if (!controller.signal.aborted) setLatestRun(null);
          } else {
            throw err;
          }
        }
        hasLoadedRef.current = true;
      } catch (err) {
        if (controller.signal.aborted) return;
        if (err instanceof DOMException && err.name === 'AbortError') return;
        if (err instanceof ApiError && err.status === 401) return;
        setError(userFacingError(err, 'Failed to load overview'));
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    }

    void load();
    return () => {
      controller.abort();
    };
  }, [token]);

  const openIssues = latestRun
    ? latestRun.summary.AMOUNT_MISMATCH +
      latestRun.summary.PAYMENT_WITHOUT_BANK_ENTRY +
      latestRun.summary.BANK_ENTRY_WITHOUT_PAYMENT +
      latestRun.summary.AMBIGUOUS +
      latestRun.summary.OUTSIDE_SETTLEMENT_WINDOW
    : null;

  const showMetrics = totalPayments !== null || (!loading && !error);

  return (
    <div className={`page${refreshing ? ' page--refreshing' : ''}`}>
      <header className="page__header">
        <div>
          <p className="page__eyebrow">Workspace {user?.workspaceId}</p>
          <h1>Overview</h1>
        </div>
      </header>

      {loading && totalPayments === null ? (
        <StatusBanner tone="info" title="Loading workspace totals…" />
      ) : null}
      {error ? <StatusBanner tone="danger" title={error} /> : null}

      {showMetrics && !error ? (
        <section className="metric-row" aria-busy={refreshing || undefined}>
          <div className="metric">
            <p className="metric__label">Payments in workspace</p>
            <p className="metric__value tabular">{totalPayments ?? 0}</p>
          </div>
          <div className="metric">
            <p className="metric__label">Open reconcile issues</p>
            <p className="metric__value tabular">
              {openIssues === null ? '—' : openIssues}
            </p>
          </div>
          <div className="metric">
            <p className="metric__label">Most recent payment net</p>
            <p className="metric__value tabular">
              {sampleNet ? `AED ${sampleNet}` : '—'}
            </p>
          </div>
        </section>
      ) : null}

      <section className="page__stack">
        {!loading && !latestRun && !error ? (
          <StatusBanner tone="warning" title="No reconciliation run yet">
            Import payments and bank entries, then run reconciliation to classify
            matched and unmatched references.
          </StatusBanner>
        ) : null}
        {latestRun ? (
          <StatusBanner tone="success" title="Latest reconciliation is ready">
            {latestRun.summary.MATCHED} matched,{' '}
            {latestRun.summary.AMOUNT_MISMATCH} amount mismatches,{' '}
            {latestRun.summary.AMBIGUOUS} ambiguous.
          </StatusBanner>
        ) : null}
        <div className="action-row">
          <Link className="action" to="/reconciliation">
            Open reconciliation
          </Link>
          <Link className="action action--ghost" to="/import">
            Import CSV
          </Link>
          <Link className="action action--ghost" to="/payments">
            View payments
          </Link>
        </div>
      </section>
    </div>
  );
}
