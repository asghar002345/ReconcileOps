import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, listInvestigations } from '../api/client';
import type { InvestigationListItem } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { StatusBanner } from '../components/StatusBanner';
import { userFacingError } from '../lib/userFacingError';
import './Pages.css';

export function InvestigationsPage() {
  const { token } = useAuth();
  const [rows, setRows] = useState<InvestigationListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      setRows(await listInvestigations(token));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return;
      setError(userFacingError(err, 'Failed to load investigations'));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="page">
      <header className="page__header">
        <div>
          <p className="page__eyebrow">Review</p>
          <h1>Investigations</h1>
        </div>
      </header>

      <p className="page__lead">
        Cases opened from reconciliation discrepancies. Notes and approvals
        document review decisions; they never rewrite payment or bank amounts.
      </p>

      {loading ? <StatusBanner tone="info" title="Loading…" /> : null}
      {error ? (
        <StatusBanner tone="danger" title={error}>
          <button type="button" className="action action--ghost" onClick={() => void load()}>
            Retry
          </button>
        </StatusBanner>
      ) : null}

      {!loading && rows.length === 0 && !error ? (
        <StatusBanner tone="info" title="No investigations yet">
          From Reconciliation, open a case on a non-matched result.
        </StatusBanner>
      ) : null}

      {rows.length > 0 ? (
        <div className="table-wrap">
          <table className="data-table">
            <caption className="sr-only">Open investigations</caption>
            <thead>
              <tr>
                <th scope="col">Reference</th>
                <th scope="col">Outcome</th>
                <th scope="col">Status</th>
                <th scope="col">Version</th>
                <th scope="col">Updated</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <Link to={`/investigations/${row.id}`}>
                      {row.referenceNormalized}
                    </Link>
                  </td>
                  <td>{row.outcome}</td>
                  <td>{row.status}</td>
                  <td className="tabular">{row.version}</td>
                  <td className="tabular">
                    {new Date(row.updatedAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
