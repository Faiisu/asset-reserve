import { useCallback, useEffect, useState } from "react";
import { api, isAbortError } from "../api";
import { AssetReservationChart } from "../components/AssetReservationChart";
import { EmptyState, ErrorState, LoadingState } from "../components/ui";
import type { AssetReservationCount, StatisticsPeriod } from "../types";

export function StatisticPage() {
  const [period, setPeriod] = useState<StatisticsPeriod>("month");
  const [data, setData] = useState<AssetReservationCount[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(
    (selectedPeriod: StatisticsPeriod, signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      void api
        .reservationsByAsset(selectedPeriod, signal)
        .then((response) => setData(response.data))
        .catch((caught) => {
          if (isAbortError(caught)) return;
          setError(caught);
        })
        .finally(() => {
          if (!signal?.aborted) setLoading(false);
        });
    },
    [],
  );

  useEffect(() => {
    const controller = new AbortController();
    load(period, controller.signal);
    return () => controller.abort();
  }, [period, load]);

  return (
    <div className="page-stack">
      <section className="detail-card">
        <header>
          <div>
            <p className="eyebrow">Analytics</p>
            <h2>Reservation requests by asset</h2>
          </div>
        </header>

        {loading && !data ? (
          <LoadingState label="Loading statistics" />
        ) : error ? (
          <ErrorState error={error} onRetry={() => load(period)} />
        ) : !data || data.length === 0 ? (
          <EmptyState
            title="No assets to chart"
            description="No assets are visible to your account yet."
          />
        ) : (
          <AssetReservationChart
            data={data}
            period={period}
            onPeriodChange={setPeriod}
          />
        )}
      </section>
    </div>
  );
}
