import { Award, Search } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, isAbortError } from "../api";
import { useAuth } from "../auth";
import {
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
} from "../components/ui";
import type { ReputationSummary } from "../types";

/**
 * Admin overview of every user's reputation score -- "see overall
 * reputation and user behavior" from the feature ask. Row click drills
 * into ReputationHistoryPage for that user's full event history. Follows
 * UsersPage/AssetsPage's cursor-pagination + AbortController + "Load more"
 * pattern.
 */
export function ReputationPage() {
  const navigate = useNavigate();
  const { isGlobalAdmin } = useAuth();
  const [users, setUsers] = useState<ReputationSummary[]>([]);
  const [search, setSearch] = useState("");
  const [draftSearch, setDraftSearch] = useState("");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(
    async (cursor?: string, append = false, signal?: AbortSignal) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);
      try {
        const response = await api.reputationUsers(
          { search: search || undefined, cursor, limit: 30 },
          signal,
        );
        setUsers((current) =>
          append ? [...current, ...response.data] : response.data,
        );
        setNextCursor(response.pageInfo.nextCursor);
      } catch (caught) {
        if (isAbortError(caught)) return;
        setError(caught);
      } finally {
        if (!signal?.aborted) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [search],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(undefined, false, controller.signal);
    return () => controller.abort();
  }, [load]);

  if (!isGlobalAdmin) {
    return (
      <EmptyState
        icon={Award}
        title="Not available"
        description="You do not have permission to view this page."
      />
    );
  }

  return (
    <div className="page-stack">
      <section className="toolbar">
        <form
          className="search-box"
          onSubmit={(event) => {
            event.preventDefault();
            setSearch(draftSearch.trim());
          }}
        >
          <Search size={18} />
          <input
            value={draftSearch}
            onChange={(event) => setDraftSearch(event.target.value)}
            placeholder="Search by name, username, or email"
            aria-label="Search users"
          />
          <button type="submit">Search</button>
        </form>
      </section>

      {loading ? (
        <LoadingState label="Loading reputation scores" />
      ) : error ? (
        <ErrorState error={error} onRetry={() => void load()} />
      ) : users.length === 0 ? (
        <EmptyState
          icon={Award}
          title="No users found"
          description="No users match your search."
        />
      ) : (
        <>
          <div className="data-table-wrap">
            <table className="data-table reputation-users-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Email</th>
                  <th>Score</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr
                    key={user.userId}
                    className="asset-table-row--clickable"
                    onClick={() => navigate(`/admin/reputation/${user.userId}`)}
                  >
                    <td>
                      <strong>{user.name ?? "—"}</strong>
                    </td>
                    <td>{user.email ?? "—"}</td>
                    <td className="reputation-score-cell">{user.score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {nextCursor && (
            <div className="load-more">
              <Button
                variant="secondary"
                loading={loadingMore}
                onClick={() => void load(nextCursor, true)}
              >
                Load more
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
