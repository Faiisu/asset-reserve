import { EmptyState } from "../components/ui";

export function StatisticPage() {
  return (
    <div className="page-stack">
      <section className="detail-card">
        <header>
          <div>
            <p className="eyebrow">Analytics</p>
            <h2>Statistic</h2>
          </div>
        </header>
        <EmptyState
          title="Nothing here yet"
          description="This page is a placeholder -- content is coming soon."
        />
      </section>
    </div>
  );
}
