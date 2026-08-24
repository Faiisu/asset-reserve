import { Search, UserRound } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api, isAbortError } from "../api";
import { useAuth } from "../auth";
import { AssetUnitStatusBadge } from "../components/AssetUnitStatus";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  cx,
  formatDate,
} from "../components/ui";
import type { AssetUnitHistory, AssetUnitSearchResult } from "../types";

export function AssetUnitHistoryPage() {
  const { hasPermission } = useAuth();
  const [draftSearch, setDraftSearch] = useState("");
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<AssetUnitSearchResult[]>([]);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [resultsError, setResultsError] = useState<unknown>(null);

  const [selected, setSelected] = useState<AssetUnitSearchResult | null>(null);
  const [history, setHistory] = useState<AssetUnitHistory | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<unknown>(null);

  useEffect(() => {
    if (!hasPermission("asset:view") || !search) {
      setResults([]);
      return;
    }
    const controller = new AbortController();
    setResultsLoading(true);
    setResultsError(null);
    void api
      .searchAssetUnits({ search, limit: 20 }, controller.signal)
      .then((response) => setResults(response.data))
      .catch((caught) => {
        if (isAbortError(caught)) return;
        setResultsError(caught);
      })
      .finally(() => {
        if (!controller.signal.aborted) setResultsLoading(false);
      });
    return () => controller.abort();
  }, [search, hasPermission]);

  const loadHistory = useCallback((unit: AssetUnitSearchResult) => {
    setSelected(unit);
    setHistory(null);
    setHistoryLoading(true);
    setHistoryError(null);
    const controller = new AbortController();
    void api
      .assetUnitHistory(unit.id, controller.signal)
      .then((response) => setHistory(response))
      .catch((caught) => {
        if (isAbortError(caught)) return;
        setHistoryError(caught);
      })
      .finally(() => {
        if (!controller.signal.aborted) setHistoryLoading(false);
      });
    return () => controller.abort();
  }, []);

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    setSearch(draftSearch.trim());
  }

  useEffect(() => {
    const trimmed = draftSearch.trim();
    const timer = setTimeout(() => {
      setSearch((current) => (current === trimmed ? current : trimmed));
    }, 300);
    return () => clearTimeout(timer);
  }, [draftSearch]);

  if (!hasPermission("asset:view")) {
    return (
      <EmptyState
        title="You cannot view asset units"
        description="This account does not have asset:view access in any management area."
      />
    );
  }

  return (
    <div className="page-stack">
      <section className="detail-card">
        <header>
          <div>
            <p className="eyebrow">Serial lookup</p>
            <h2>Asset unit history</h2>
          </div>
        </header>
        <form className="search-box" onSubmit={submitSearch}>
          <Search size={17} />
          <input
            value={draftSearch}
            onChange={(event) => setDraftSearch(event.target.value)}
            placeholder="Search by serial number"
            aria-label="Search asset units by serial number"
          />
          <button type="submit">Search</button>
        </form>

        {!search ? (
          <EmptyState
            title="Search for a serial number"
            description="Enter a full or partial serial number to find a unit and view its history."
          />
        ) : resultsLoading ? (
          <LoadingState label="Searching units" />
        ) : resultsError ? (
          <ErrorState error={resultsError} />
        ) : results.length === 0 ? (
          <EmptyState
            title="No matching units"
            description="No asset unit serial number matches this search."
          />
        ) : (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Serial number</th>
                  <th>Asset</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {results.map((unit) => (
                  <tr
                    key={unit.id}
                    className={cx(
                      "asset-table-row--clickable",
                      selected?.id === unit.id && "asset-table-row--selected",
                    )}
                    onClick={() => loadHistory(unit)}
                  >
                    <td className="mono">{unit.serialNumber}</td>
                    <td>
                      <strong className="table-primary">
                        {unit.asset.name}
                      </strong>
                      <small className="table-secondary">
                        {unit.asset.partNumber || "No part number"}
                      </small>
                    </td>
                    <td>
                      <AssetUnitStatusBadge status={unit.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selected && (
        <section className="detail-card">
          <header>
            <div>
              <p className="eyebrow">{selected.asset.name}</p>
              <h2 className="mono">{selected.serialNumber}</h2>
            </div>
            <Link to={`/assets/${selected.asset.id}`} className="button button--secondary button--sm">
              View asset
            </Link>
          </header>

          {historyLoading ? (
            <LoadingState label="Loading unit history" />
          ) : historyError ? (
            <ErrorState error={historyError} />
          ) : history ? (
            <>
              <dl className="detail-list">
                <div>
                  <dt>Current status</dt>
                  <dd>
                    <AssetUnitStatusBadge status={history.unit.status} />
                  </dd>
                </div>
                <div>
                  <dt>Registered</dt>
                  <dd>
                    {history.stats.registeredAt
                      ? formatDate(history.stats.registeredAt, true)
                      : "Unknown"}
                  </dd>
                </div>
                <div>
                  <dt>Last activity</dt>
                  <dd>
                    {history.stats.lastEventAt
                      ? formatDate(history.stats.lastEventAt, true)
                      : "No activity yet"}
                  </dd>
                </div>
                <div>
                  <dt>Total events</dt>
                  <dd>{history.stats.total}</dd>
                </div>
              </dl>

              {Object.keys(history.stats.byEventType).length > 0 && (
                <div className="event-type-breakdown">
                  {Object.entries(history.stats.byEventType).map(
                    ([eventType, count]) => (
                      <span key={eventType}>
                        {eventType} <b>{count}</b>
                      </span>
                    ),
                  )}
                </div>
              )}

              {history.events.length === 0 ? (
                <EmptyState
                  title="No history yet"
                  description="This unit has no recorded events."
                />
              ) : (
                <div className="data-table-wrap">
                  <table className="data-table ledger-table">
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>Event</th>
                        <th>Status change</th>
                        <th>Reason</th>
                        <th>Performed by</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.events.map((event) => (
                        <tr key={event.id}>
                          <td className="mono table-date">
                            {formatDate(event.createdAt, true)}
                          </td>
                          <td>
                            <span className="transaction">
                              {event.eventType}
                            </span>
                          </td>
                          <td>
                            {event.fromStatus ?? "—"} → {event.toStatus ?? "—"}
                          </td>
                          <td>
                            <strong className="table-primary">
                              {event.reason || "—"}
                            </strong>
                            <small className="table-secondary">
                              {event.batchDescription}
                            </small>
                          </td>
                          <td>
                            <span className="performer">
                              <UserRound size={15} />
                              {event.performedBy.name ??
                                event.performedBy.email ??
                                "Unnamed user"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : null}
        </section>
      )}
    </div>
  );
}
