import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ApiError,
  addInvestigationNote,
  decideProposal,
  explainInvestigation,
  fetchInvestigation,
  filsToAed,
  proposeResolution,
} from '../api/client';
import type { ExplainResult, InvestigationDetail } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { StatusBanner } from '../components/StatusBanner';
import './Pages.css';

export function InvestigationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { token, user } = useAuth();
  const [detail, setDetail] = useState<InvestigationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [summary, setSummary] = useState('');
  const [decisionNote, setDecisionNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [explaining, setExplaining] = useState(false);
  const [explanation, setExplanation] = useState<ExplainResult | null>(null);

  const load = useCallback(async () => {
    if (!token || !id) return;
    setLoading(true);
    setError(null);
    try {
      setDetail(await fetchInvestigation(token, id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [token, id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function runMutate(
    action: () => Promise<InvestigationDetail>,
    clearField?: 'note' | 'summary' | 'decisionNote',
  ): Promise<void> {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      // Mutate responses omit audit — keep current audit until GET returns.
      const next = await action();
      setDetail((prev) => ({ ...next, audit: prev?.audit ?? [] }));
      if (clearField === 'note') setNote('');
      if (clearField === 'summary') setSummary('');
      if (clearField === 'decisionNote') setDecisionNote('');

      const full = await fetchInvestigation(token, next.id);
      setDetail(full);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Action failed');
      if (err instanceof ApiError && err.status === 409) {
        await load();
      }
    } finally {
      setBusy(false);
    }
  }

  function onAddNote(event: FormEvent) {
    event.preventDefault();
    if (!token || !detail || !note.trim()) return;
    void runMutate(
      () =>
        addInvestigationNote(token, detail.id, note.trim(), detail.version),
      'note',
    );
  }

  function onPropose(event: FormEvent) {
    event.preventDefault();
    if (!token || !detail || !summary.trim()) return;
    void runMutate(
      () =>
        proposeResolution(token, detail.id, summary.trim(), detail.version),
      'summary',
    );
  }

  function onDecide(decision: 'APPROVED' | 'REJECTED') {
    if (!token || !detail) return;
    const pending = detail.proposals.find((p) => p.status === 'PENDING');
    if (!pending) return;
    void runMutate(
      () =>
        decideProposal(
          token,
          detail.id,
          pending.id,
          decision,
          detail.version,
          decisionNote.trim() || undefined,
        ),
      'decisionNote',
    );
  }

  const isAnalyst = user?.role === 'analyst';
  const isApprover = user?.role === 'approver';
  const pending = detail?.proposals.find((p) => p.status === 'PENDING');
  const canPropose =
    isAnalyst &&
    detail &&
    detail.status !== 'RESOLVED' &&
    detail.status !== 'PENDING_APPROVAL';

  async function onExplain() {
    if (!token || !detail) return;
    setExplaining(true);
    setError(null);
    try {
      setExplanation(await explainInvestigation(token, detail.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Explain failed');
    } finally {
      setExplaining(false);
    }
  }

  return (
    <div className="page">
      <header className="page__header">
        <div>
          <p className="page__eyebrow">
            <Link to="/investigations">Investigations</Link>
          </p>
          <h1>{detail?.discrepancy.referenceNormalized ?? 'Investigation'}</h1>
        </div>
        {detail ? (
          <div className="button-row">
            <button
              type="button"
              className="action action--ghost"
              disabled={explaining}
              onClick={() => void onExplain()}
            >
              {explaining ? 'Explaining…' : 'Explain discrepancy'}
            </button>
            <p className="page__meta tabular">
              {detail.status} · v{detail.version}
            </p>
          </div>
        ) : null}
      </header>

      {loading ? <StatusBanner tone="info" title="Loading…" /> : null}
      {error ? <StatusBanner tone="danger" title={error} /> : null}

      {detail ? (
        <>
          <section className="metric-row">
            <div className="metric">
              <p className="metric__label">Outcome (unchanged)</p>
              <p className="metric__value">{detail.discrepancy.outcome}</p>
            </div>
            <div className="metric">
              <p className="metric__label">Difference</p>
              <p className="metric__value tabular">
                {detail.discrepancy.differenceFils
                  ? `${filsToAed(detail.discrepancy.differenceFils)} AED`
                  : '—'}
              </p>
            </div>
          </section>

          <p className="page__note">{detail.discrepancy.reason}</p>

          {explanation ? (
            <section className="page__stack">
              <h2>Explanation</h2>
              <p className="page__meta">
                {explanation.promptVersion} · {explanation.modelVersion} ·{' '}
                {explanation.latencyMs}ms · amounts from SQL only
              </p>
              <p className="page__note">{explanation.explanation.uncertainty}</p>
              <h3>Observed facts</h3>
              <ul className="result-list">
                {explanation.explanation.observedFacts.map((fact) => (
                  <li key={fact}>{fact}</li>
                ))}
              </ul>
              <h3>Possible causes</h3>
              <ul className="result-list">
                {explanation.explanation.possibleCauses.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <h3>Citations</h3>
              <ul className="timeline">
                {explanation.explanation.citations.map((citation) => (
                  <li key={citation.chunkId}>
                    <p>
                      {citation.documentTitle} — {citation.section}
                      {citation.isDemoPolicy ? ' (demo policy)' : ''}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="page__stack">
            <h2>Notes</h2>
            {detail.notes.length === 0 ? (
              <p className="page__meta">No notes yet.</p>
            ) : (
              <ul className="timeline">
                {detail.notes.map((item) => (
                  <li key={item.id}>
                    <p>{item.body}</p>
                    <p className="page__meta tabular">
                      {new Date(item.createdAt).toLocaleString()}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            {isAnalyst && detail.status !== 'RESOLVED' ? (
              <form className="stack-form" onSubmit={onAddNote}>
                <label>
                  Add note
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={3}
                    required
                  />
                </label>
                <button type="submit" className="action" disabled={busy}>
                  Save note
                </button>
              </form>
            ) : null}
          </section>

          <section className="page__stack">
            <h2>Proposals</h2>
            {detail.proposals.length === 0 ? (
              <p className="page__meta">No proposals yet.</p>
            ) : (
              <ul className="timeline">
                {detail.proposals.map((proposal) => (
                  <li key={proposal.id}>
                    <p>
                      <strong>{proposal.status}</strong> — {proposal.summary}
                    </p>
                    {proposal.decision ? (
                      <p className="page__meta">
                        Decision: {proposal.decision.decision}
                        {proposal.decision.note
                          ? ` — ${proposal.decision.note}`
                          : ''}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}

            {canPropose ? (
              <form className="stack-form" onSubmit={onPropose}>
                <label>
                  Propose resolution
                  <textarea
                    value={summary}
                    onChange={(e) => setSummary(e.target.value)}
                    rows={3}
                    required
                  />
                </label>
                <button type="submit" className="action" disabled={busy}>
                  Submit for approval
                </button>
              </form>
            ) : null}

            {isApprover && pending ? (
              <div className="stack-form">
                <label>
                  Approver note (optional)
                  <textarea
                    value={decisionNote}
                    onChange={(e) => setDecisionNote(e.target.value)}
                    rows={2}
                  />
                </label>
                <div className="button-row">
                  <button
                    type="button"
                    className="action"
                    disabled={busy}
                    onClick={() => onDecide('APPROVED')}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    className="action action--ghost"
                    disabled={busy}
                    onClick={() => onDecide('REJECTED')}
                  >
                    Reject
                  </button>
                </div>
              </div>
            ) : null}
          </section>

          <section className="page__stack">
            <h2>Audit</h2>
            {(detail.audit ?? []).length === 0 ? (
              <p className="page__meta">No audit events yet.</p>
            ) : (
              <ul className="timeline">
                {(detail.audit ?? []).map((event) => (
                  <li key={event.id}>
                    <p>{event.action}</p>
                    <p className="page__meta tabular">
                      {new Date(event.createdAt).toLocaleString()}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
