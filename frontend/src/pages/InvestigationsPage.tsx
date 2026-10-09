import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, listInvestigations } from '../api/client';
import type { InvestigationListItem } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { StatusBanner } from '../components/StatusBanner';
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
      setError(err instanceof ApiError ? err.message : 'Failed to load');
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
          <p className="page__eyebrow">Day 3 review</p>
          <h1>Investigations</h1>
        </div>
      </header>

      <p className="page__note">
        Open cases from reconciliation discrepancies. Approvals do not rewrite
        payment or bank amounts. See <code>docs/investigations-learning.md</code>.
      </p>

      {loading ? <StatusBanner tone="info" title="Loading…" /> : null}
      {error ? <StatusBanner tone="danger" title={error} /> : null}

      {!loading && rows.length === 0 ? (
        <StatusBanner tone="info" title="No investigations yet">
          From Reconciliation, open a case on a non-matched result.
        </StatusBanner>
      ) : null}

      {rows.length > 0 ? (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Reference</th>
                <th>Outcome</th>
                <th>Status</th>
                <th>Version</th>
                <th>Updated</th>
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
