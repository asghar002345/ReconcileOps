import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ApiError, filsToAed, listPayments } from '../api/client';
import type { PaymentPage } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { StatusBanner } from '../components/StatusBanner';
import { userFacingError } from '../lib/userFacingError';
import './Pages.css';

function pageFromSearch(params: URLSearchParams): number {
  const raw = Number(params.get('page') ?? '1');
  return Number.isInteger(raw) && raw >= 1 ? raw : 1;
}

export function PaymentsPage() {
  const { token } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const page = pageFromSearch(searchParams);
  const [data, setData] = useState<PaymentPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();

    async function load() {
      if (hasLoadedRef.current) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const result = await listPayments(token!, page, 10, controller.signal);
        if (!controller.signal.aborted) {
          setData(result);
          hasLoadedRef.current = true;
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        if (err instanceof DOMException && err.name === 'AbortError') return;
        if (err instanceof ApiError && err.status === 401) return;
        setError(userFacingError(err, 'Failed to load payments'));
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
  }, [token, page]);

  function goToPage(next: number) {
    setSearchParams(next <= 1 ? {} : { page: String(next) }, { replace: false });
  }

  return (
    <div className={`page${refreshing ? ' page--refreshing' : ''}`}>
      <header className="page__header">
        <div>
          <p className="page__eyebrow">Workspace ledger</p>
          <h1>Payments</h1>
        </div>
        {data ? (
          <p className="page__meta tabular">
            {data.totalItems} total · page {data.page} of{' '}
            {Math.max(data.totalPages, 1)}
          </p>
        ) : null}
      </header>

      {loading && !data ? (
        <StatusBanner tone="info" title="Loading payments…" />
      ) : null}
      {error ? <StatusBanner tone="danger" title={error} /> : null}

      {!loading && data && data.items.length === 0 ? (
        <StatusBanner tone="info" title="No payments yet">
          Import a payments CSV to populate this workspace.
        </StatusBanner>
      ) : null}

      {data && data.items.length > 0 ? (
        <div className="table-wrap" aria-busy={refreshing || undefined}>
          <table className="data-table">
            <caption className="sr-only">
              Workspace payments, page {data.page}
            </caption>
            <thead>
              <tr>
                <th scope="col">Source id</th>
                <th scope="col">Reference</th>
                <th scope="col" className="num">
                  Gross
                </th>
                <th scope="col" className="num">
                  Fee
                </th>
                <th scope="col" className="num">
                  Net
                </th>
                <th scope="col">Paid at (UTC)</th>
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
            disabled={page <= 1 || loading || refreshing}
            onClick={() => goToPage(Math.max(1, page - 1))}
          >
            Previous
          </button>
          <button
            type="button"
            disabled={page >= data.totalPages || loading || refreshing}
            onClick={() => goToPage(page + 1)}
          >
            Next
          </button>
          <span className="pager__status tabular" aria-live="polite">
            Page {page} of {data.totalPages}
          </span>
        </div>
      ) : null}
    </div>
  );
}
