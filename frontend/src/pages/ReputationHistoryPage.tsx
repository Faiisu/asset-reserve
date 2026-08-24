import { ArrowLeft } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, isAbortError } from "../api";
import { useAuth } from "../auth";
import { ReputationEventList } from "../components/ReputationEventList";
import {
  Breadcrumb,
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
} from "../components/ui";
import type { ReputationEvent, ReputationSummary } from "../types";

function scoreClass(score: number) {
  if (score >= 70) return "reputation-score reputation-score--good";
  if (score < 40) return "reputation-score reputation-score--bad";
  return "reputation-score";
}

/** Admin drilldown from ReputationPage: one user's score + full event
 * history, so an admin can see exactly what happened and why. */
export function ReputationHistoryPage() {
  const { isGlobalAdmin } = useAuth();
  const { userId = "" } = useParams();
  const [summary, setSummary] = useState<ReputationSummary | null>(null);
  const [events, setEvents] = useState<ReputationEvent[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [summaryResult, eventsResult] = await Promise.all([
        api.reputationUser(userId),
        api.reputationUserEvents(userId, { limit: 30 }),
      ]);
      setSummary(summaryResult);
      setEvents(eventsResult.data);
      setNextCursor(eventsResult.pageInfo.nextCursor);
    } catch (caught) {
      setError(caught);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function loadMore() {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const result = await api.reputationUserEvents(userId, {
        cursor: nextCursor,
        limit: 30,
      });
      setEvents((current) => [...current, ...result.data]);
      setNextCursor(result.pageInfo.nextCursor);
    } catch (caught) {
      if (!isAbortError(caught)) setError(caught);
    } finally {
      setLoadingMore(false);
    }
  }

  if (!isGlobalAdmin) {
    return (
      <EmptyState
        title="Not available"
        description="You do not have permission to view this page."
      />
    );
  }

  return (
    <div className="page-stack">
      <Breadcrumb
        items={[
          { label: "Reputation", to: "/admin/reputation" },
          { label: summary?.name ?? summary?.email ?? "User" },
        ]}
      />
      <header className="page-header">
        <div>
          <h1>{summary?.name ?? summary?.email ?? "Reputation history"}</h1>
          <p className="page-header__description">{summary?.email}</p>
        </div>
        <div className="page-header__actions">
          <Link className="button button--secondary button--md" to="/admin/reputation">
            <ArrowLeft size={16} />
            Back
          </Link>
        </div>
      </header>

      {loading ? (
        <LoadingState label="Loading reputation history" />
      ) : error ? (
        <ErrorState error={error} onRetry={() => void load()} />
      ) : !summary ? (
        <EmptyState title="User not found" description="This user could not be found." />
      ) : (
        <>
          <section className="form-section">
            <span className={scoreClass(summary.score)}>{summary.score}</span>
            <p style={{ color: "var(--ink-faint)", fontSize: "13px" }}>out of 100</p>
          </section>
          <section className="form-section">
            <div className="form-section__heading">
              <div>
                <h2>Event history</h2>
                <p>Every return outcome that has moved this user's score.</p>
              </div>
            </div>
            <ReputationEventList events={events} />
            {nextCursor && (
              <div className="load-more">
                <Button
                  variant="secondary"
                  loading={loadingMore}
                  onClick={() => void loadMore()}
                >
                  Load more
                </Button>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
