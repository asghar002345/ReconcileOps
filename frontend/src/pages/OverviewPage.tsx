import { useEffect, useState } from 'react';
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

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const page = await listPayments(token!, 1, 5);
        if (cancelled) return;
        setTotalPayments(page.totalItems);
        const first = page.items[0];
        if (first) {
          const net =
            BigInt(first.grossAmountFils) - BigInt(first.feeAmountFils);
          setSampleNet(filsToAed(net.toString()));
        }
        try {
          const run = await fetchLatestReconciliation(token!);
          if (!cancelled) setLatestRun(run);
        } catch (err) {
          if (err instanceof ApiError && err.status === 404) {
            if (!cancelled) setLatestRun(null);
          } else {
            throw err;
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : 'Failed to load');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const openIssues = latestRun
    ? latestRun.summary.AMOUNT_MISMATCH +
      latestRun.summary.PAYMENT_WITHOUT_BANK_ENTRY +
      latestRun.summary.BANK_ENTRY_WITHOUT_PAYMENT +
      latestRun.summary.AMBIGUOUS +
      latestRun.summary.OUTSIDE_SETTLEMENT_WINDOW
    : null;

  return (
    <div className="page">
      <header className="page__header">
        <div>
          <p className="page__eyebrow">Workspace {user?.workspaceId}</p>
          <h1>Overview</h1>
        </div>
      </header>

      {loading ? <StatusBanner tone="info" title="Loading workspace totals…" /> : null}
      {error ? <StatusBanner tone="danger" title={error} /> : null}

      {!loading && !error ? (
        <section className="metric-row">
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
            <p className="metric__label">Sample expected net (first row)</p>
            <p className="metric__value tabular">
              {sampleNet ? `AED ${sampleNet}` : '—'}
            </p>
          </div>
        </section>
      ) : null}

      <section className="page__stack">
        {!latestRun ? (
          <StatusBanner tone="warning" title="No reconciliation run yet">
            Run the matcher to classify MATCHED, mismatches, and unmatched
            references.
          </StatusBanner>
        ) : (
          <StatusBanner tone="success" title="Latest reconciliation loaded">
            Rule {latestRun.ruleVersion}: {latestRun.summary.MATCHED} matched,{' '}
            {latestRun.summary.AMOUNT_MISMATCH} amount mismatches,{' '}
            {latestRun.summary.AMBIGUOUS} ambiguous.
          </StatusBanner>
        )}
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
