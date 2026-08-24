import { formatDate } from "./ui";
import type { ReputationEvent, ReputationEventType } from "../types";

// Shared between ReputationHistoryPage (admin drilldown) and AccountPage's
// "My reputation" section -- both just need to render the same shape of
// data, so the table markup lives here once instead of twice.

const EVENT_LABEL: Record<ReputationEventType, string> = {
  RETURN_ON_TIME: "Returned on time",
  RETURN_LATE: "Returned late",
  ASSET_BROKEN: "Asset returned broken",
  ASSET_LOST: "Asset returned lost",
};

function DeltaBadge({ delta }: { delta: number }) {
  const positive = delta > 0;
  return (
    <span
      className="reputation-delta-badge"
      style={{
        color: positive ? "var(--green)" : "var(--red)",
        background: positive ? "var(--green-soft)" : "var(--red-soft)",
      }}
    >
      {positive ? `+${delta}` : delta}
    </span>
  );
}

export function ReputationEventList({
  events,
  emptyLabel = "No reputation events yet.",
}: {
  events: ReputationEvent[];
  emptyLabel?: string;
}) {
  if (events.length === 0) {
    return <p className="reputation-event-list__empty">{emptyLabel}</p>;
  }
  return (
    <ul className="reputation-event-list">
      {events.map((event) => (
        <li key={event.id} className="reputation-event-list__row">
          <DeltaBadge delta={event.delta} />
          <div className="reputation-event-list__main">
            <span>{EVENT_LABEL[event.type] ?? event.type}</span>
            {event.note && (
              <span className="reputation-event-list__note">{event.note}</span>
            )}
          </div>
          <span className="reputation-event-list__date">
            {formatDate(event.createdAt, true)}
          </span>
        </li>
      ))}
    </ul>
  );
}
