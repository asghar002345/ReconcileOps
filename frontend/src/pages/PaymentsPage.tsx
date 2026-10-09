import { useEffect, useState } from 'react';
import { ApiError, filsToAed, listPayments } from '../api/client';
import type { PaymentPage } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { StatusBanner } from '../components/StatusBanner';
import './Pages.css';

export function PaymentsPage() {
  const { token } = useAuth();
  const [page, setPage] = useState(1);
  const [data, setData] = useState<PaymentPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const result = await listPayments(token!, page, 10);
        if (!cancelled) setData(result);
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
  }, [token, page]);

  return (
    <div className="page">
      <header className="page__header">
        <div>
          <p className="page__eyebrow">Canonical records</p>
          <h1>Payments</h1>
        </div>
        {data ? (
          <p className="page__meta tabular">
            {data.totalItems} total · page {data.page} of{' '}
            {Math.max(data.totalPages, 1)}
          </p>
        ) : null}
      </header>

      {loading ? <StatusBanner tone="info" title="Loading payments…" /> : null}
      {error ? <StatusBanner tone="danger" title={error} /> : null}

      {!loading && data && data.items.length === 0 ? (
        <StatusBanner tone="info" title="No payments yet">
          Import a payments CSV to populate this workspace.
        </StatusBanner>
      ) : null}

      {data && data.items.length > 0 ? (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Source id</th>
                <th>Reference</th>
                <th className="num">Gross</th>
                <th className="num">Fee</th>
                <th className="num">Net</th>
                <th>Paid at (UTC)</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => {
                const net =
                  BigInt(item.grossAmountFils) - BigInt(item.feeAmountFils);
                return (
                  <tr key={item.id}>
                    <td>{item.sourcePaymentId}</td>
                    <td>{item.referenceOriginal}</td>
                    <td className="num tabular">
                      {filsToAed(item.grossAmountFils)}
                    </td>
                    <td className="num tabular">
                      {filsToAed(item.feeAmountFils)}
                    </td>
                    <td className="num tabular">{filsToAed(net.toString())}</td>
                    <td className="tabular">
                      {new Date(item.paidAt).toISOString().replace('.000Z', 'Z')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {data && data.totalPages > 1 ? (
        <div className="pager">
          <button
            type="button"
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </button>
          <button
            type="button"
            disabled={page >= data.totalPages || loading}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      ) : null}
    </div>
  );
}
