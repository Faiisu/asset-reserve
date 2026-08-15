import {
  ArrowRight,
  ArrowLeft,
  CalendarClock,
  Check,
  Clock3,
  PackageSearch,
  Plus,
  Save,
  Search,
  Send,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, ApiClientError } from "../api";
import { useAuth } from "../auth";
import {
  AssetPicture,
  Button,
  Field,
  Input,
  PageHeader,
  Textarea,
} from "../components/ui";
import {
  defaultReservationWindow,
  readRecentReservations,
  rememberReservation,
  reservationStatusLabel,
  toLocalDateTime,
} from "../reservations";
import type { AssetSummary } from "../types";

type SelectedAsset = { asset: AssetSummary; quantity: number };
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function ReservationCreatePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { hasPermission, hasAreaPermission } = useAuth();
  const requestedStartAt = searchParams.get("startAt");
  const requestedEndAt = searchParams.get("endAt");
  const requestedAssetKey = searchParams.getAll("assetId").join(",");
  const requestedAssetIds = useMemo(
    () =>
      Array.from(
        new Set(
          requestedAssetKey
            .split(",")
            .filter((assetId) => UUID_PATTERN.test(assetId)),
        ),
      ).slice(0, 100),
    [requestedAssetKey],
  );
  const defaults = useMemo(() => {
    const fallback = defaultReservationWindow();
    if (!requestedStartAt || !requestedEndAt) return fallback;
    const start = new Date(requestedStartAt);
    const end = new Date(requestedEndAt);
    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime()) ||
      end <= start
    ) {
      return fallback;
    }
    return {
      startAt: toLocalDateTime(start.toISOString()),
      endAt: toLocalDateTime(end.toISOString()),
    };
  }, [requestedEndAt, requestedStartAt]);
  const [eventName, setEventName] = useState("");
  const [description, setDescription] = useState("");
  const [startAt, setStartAt] = useState(defaults.startAt);
  const [endAt, setEndAt] = useState(defaults.endAt);
  const [search, setSearch] = useState("");
  const [assets, setAssets] = useState<AssetSummary[]>([]);
  const [selected, setSelected] = useState<SelectedAsset[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(true);
  const [submitting, setSubmitting] = useState<
    "DRAFT" | "PENDING_APPROVAL" | null
  >(null);
  const [error, setError] = useState<unknown>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [reservationReference, setReservationReference] = useState("");
  const recent = useMemo(readRecentReservations, []);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      setLoadingAssets(true);
      void api
        .assets({ search: search.trim(), isActive: true, limit: 100 })
        .then((response) => active && setAssets(response.data))
        .catch((caught) => active && setError(caught))
        .finally(() => active && setLoadingAssets(false));
    }, 180);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [search]);

  useEffect(() => {
    if (!hasPermission("reservation:create")) return;
    if (!requestedAssetIds.length) return;
    let active = true;
    void Promise.allSettled(
      requestedAssetIds.map((assetId) => api.asset(assetId)),
    ).then((results) => {
      if (!active) return;
      const imported = results.flatMap((result) =>
        result.status === "fulfilled" &&
        result.value.isActive &&
        hasAreaPermission("reservation:create", result.value.managementArea.id)
          ? [result.value]
          : [],
      );
      setSelected((current) => {
        const currentIds = new Set(current.map((item) => item.asset.id));
        return [
          ...current,
          ...imported
            .filter((asset) => !currentIds.has(asset.id))
            .map((asset) => ({ asset, quantity: 1 })),
        ];
      });
    });
    return () => {
      active = false;
    };
  }, [requestedAssetKey]);

  const selectedIds = new Set(selected.map((item) => item.asset.id));
  const reservableAssets = assets.filter((asset) =>
    hasAreaPermission("reservation:create", asset.managementArea.id),
  );

  function addAsset(asset: AssetSummary) {
    if (selectedIds.has(asset.id)) return;
    setSelected((current) => [...current, { asset, quantity: 1 }]);
  }

  function updateQuantity(assetId: string, quantity: number) {
    setSelected((current) =>
      current.map((item) =>
        item.asset.id === assetId ? { ...item, quantity } : item,
      ),
    );
  }

  async function submit(
    event: FormEvent,
    status: "DRAFT" | "PENDING_APPROVAL",
  ) {
    event.preventDefault();
    setError(null);
    setFields({});
    if (!eventName.trim()) {
      setFields({ eventName: "Enter an event name." });
      return;
    }
    if (!selected.length) {
      setFields({ items: "Add at least one asset to this reservation." });
      return;
    }
    if (
      selected.some(
        (item) =>
          !Number.isInteger(item.quantity) ||
          item.quantity < 1 ||
          item.quantity > item.asset.totalQuantity,
      )
    ) {
      setFields({
        items: "Each quantity must be a whole number within the asset total.",
      });
      return;
    }
    if (
      !startAt ||
      !endAt ||
      Number.isNaN(new Date(startAt).getTime()) ||
      Number.isNaN(new Date(endAt).getTime())
    ) {
      setFields({ startAt: "Set a valid start and end time." });
      return;
    }
    if (new Date(endAt) <= new Date(startAt)) {
      setFields({ endAt: "End time must be later than start time." });
      return;
    }
    setSubmitting(status);
    try {
      const result = await api.createReservation({
        eventName: eventName.trim(),
        description: description.trim() || null,
        startAt: new Date(startAt).toISOString(),
        endAt: new Date(endAt).toISOString(),
        status,
        items: selected.map((item) => ({
          assetId: item.asset.id,
          quantity: item.quantity,
        })),
      });
      rememberReservation(result);
      navigate(`/reservations/${result.id}`, {
        replace: true,
        state: {
          notice:
            status === "DRAFT"
              ? "Reservation saved as a draft"
              : "Reservation sent for approval",
        },
      });
    } catch (caught) {
      if (caught instanceof ApiClientError) setFields(caught.fields);
      setError(caught);
    } finally {
      setSubmitting(null);
    }
  }

  if (!hasPermission("reservation:create")) {
    return (
      <div className="page-stack reservation-page">
        <PageHeader
          eyebrow="Reservation / review desk"
          title="Open a reservation"
          description="Use a reservation reference from the requester or return to an item you recently reviewed on this device."
        />
        <div className="reservation-review-landing">
          <section className="reservation-panel">
            <div className="reservation-panel__heading">
              <span className="reservation-step">→</span>
              <div>
                <h2>Reservation reference</h2>
                <p>
                  Paste the full reservation ID to open its approval details.
                </p>
              </div>
            </div>
            <form
              className="reservation-reference-form"
              onSubmit={(event) => {
                event.preventDefault();
                if (reservationReference.trim())
                  navigate(`/reservations/${reservationReference.trim()}`);
              }}
            >
              <Field label="Reservation ID" required>
                <Input
                  value={reservationReference}
                  onChange={(event) =>
                    setReservationReference(event.target.value)
                  }
                  placeholder="00000000-0000-0000-0000-000000000000"
                  required
                />
              </Field>
              <Button type="submit">
                Open reservation <ArrowRight size={16} />
              </Button>
            </form>
          </section>
          <RecentReservations items={recent} />
        </div>
      </div>
    );
  }

  return (
    <div className="page-stack reservation-page">
      <PageHeader
        eyebrow="Reservation / plan assets"
        title="Reserve the right kit, at the right time."
        description="Set the event window, assemble the asset list, then save a draft or send it directly to area approvers."
        actions={
          <Link className="button button--quiet button--md" to="/reservations">
            <ArrowLeft size={17} /> Back to reservations
          </Link>
        }
      />

      <form
        className="reservation-compose"
        onSubmit={(event) => void submit(event, "PENDING_APPROVAL")}
        noValidate
      >
        <div className="reservation-compose__main">
          {Boolean(error) && (
            <div className="form-alert" role="alert">
              {error instanceof ApiClientError
                ? error.message
                : "Unable to create the reservation."}
            </div>
          )}

          <section className="reservation-panel">
            <div className="reservation-panel__heading">
              <span className="reservation-step">01</span>
              <div>
                <h2>Event and schedule</h2>
                <p>The time window is checked against approved reservations.</p>
              </div>
            </div>
            <Field label="Event name" required error={fields.eventName}>
              <Input
                value={eventName}
                onChange={(event) => setEventName(event.target.value)}
                placeholder="Quarterly town hall"
                maxLength={200}
                autoFocus
                required
              />
            </Field>
            <div className="form-grid form-grid--2">
              <Field label="Starts" required error={fields.startAt}>
                <Input
                  type="datetime-local"
                  value={startAt}
                  onChange={(event) => setStartAt(event.target.value)}
                  required
                />
              </Field>
              <Field label="Ends" required error={fields.endAt}>
                <Input
                  type="datetime-local"
                  value={endAt}
                  min={startAt}
                  onChange={(event) => setEndAt(event.target.value)}
                  required
                />
              </Field>
            </div>
            <Field label="Event notes" error={fields.description}>
              <Textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Venue, setup notes, and anything approvers need to know"
                maxLength={10000}
                rows={4}
              />
            </Field>
          </section>

          <section className="reservation-panel">
            <div className="reservation-panel__heading">
              <span className="reservation-step">02</span>
              <div>
                <h2>Asset manifest</h2>
                <p>
                  Choose quantities for each asset. Availability is rechecked
                  when an approver acts.
                </p>
              </div>
              <span className="manifest-count">{selected.length} selected</span>
            </div>

            {fields.items && (
              <div className="inline-field-error" role="alert">
                {fields.items}
              </div>
            )}
            {selected.length > 0 && (
              <div className="reservation-manifest">
                {selected.map(({ asset, quantity }, index) => (
                  <div className="manifest-row" key={asset.id}>
                    <span className="manifest-row__number">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <AssetPicture src={asset.pictureUrl} name={asset.name} />
                    <div className="manifest-row__asset">
                      <strong>{asset.name}</strong>
                      <span>
                        {asset.managementArea.name} · {asset.availableQuantity}{" "}
                        currently available
                      </span>
                    </div>
                    <Field label="Quantity">
                      <Input
                        className="manifest-row__quantity"
                        type="number"
                        min={1}
                        max={asset.totalQuantity}
                        value={quantity}
                        onChange={(event) =>
                          updateQuantity(asset.id, Number(event.target.value))
                        }
                        required
                      />
                    </Field>
                    <button
                      className="icon-button icon-button--danger"
                      type="button"
                      aria-label={`Remove ${asset.name}`}
                      onClick={() =>
                        setSelected((current) =>
                          current.filter((item) => item.asset.id !== asset.id),
                        )
                      }
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="asset-picker">
              <div className="asset-picker__search">
                <Search size={17} />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search active assets"
                  aria-label="Search active assets"
                />
              </div>
              <div className="asset-picker__list" aria-live="polite">
                {loadingAssets ? (
                  <p className="asset-picker__message">Loading assets…</p>
                ) : reservableAssets.length === 0 ? (
                  <p className="asset-picker__message">
                    No reservable assets match this search.
                  </p>
                ) : (
                  reservableAssets.map((asset) => (
                    <button
                      type="button"
                      className="asset-picker__item"
                      key={asset.id}
                      disabled={selectedIds.has(asset.id)}
                      onClick={() => addAsset(asset)}
                    >
                      <AssetPicture src={asset.pictureUrl} name={asset.name} />
                      <span>
                        <strong>{asset.name}</strong>
                        <small>
                          {asset.managementArea.name} · {asset.totalQuantity}{" "}
                          total
                        </small>
                      </span>
                      {selectedIds.has(asset.id) ? (
                        <Check size={17} />
                      ) : (
                        <Plus size={17} />
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>
          </section>

          <div className="reservation-submit">
            <Button
              type="button"
              variant="secondary"
              loading={submitting === "DRAFT"}
              onClick={(event) => void submit(event, "DRAFT")}
            >
              <Save size={17} />
              Save draft
            </Button>
            <Button type="submit" loading={submitting === "PENDING_APPROVAL"}>
              <Send size={17} />
              Send for approval
            </Button>
          </div>
        </div>

        <aside className="reservation-compose__rail">
          <div className="schedule-card">
            <p className="eyebrow eyebrow--light">Event window</p>
            <h3>{eventName || "Untitled event"}</h3>
            <div className="schedule-track">
              <span>
                <CalendarClock size={18} />
              </span>
              <div>
                <small>Starts</small>
                <strong>{formatPreviewDate(startAt)}</strong>
              </div>
              <i />
              <span>
                <Clock3 size={18} />
              </span>
              <div>
                <small>Ends</small>
                <strong>{formatPreviewDate(endAt)}</strong>
              </div>
            </div>
            <div className="schedule-card__manifest">
              <PackageSearch size={18} />
              <span>
                <strong>{selected.length}</strong> asset types
              </span>
              <span>
                <strong>
                  {selected.reduce(
                    (sum, item) => sum + (item.quantity || 0),
                    0,
                  )}
                </strong>{" "}
                total units
              </span>
            </div>
          </div>

          <RecentReservations items={recent} />
        </aside>
      </form>
    </div>
  );
}

function RecentReservations({
  items,
}: {
  items: ReturnType<typeof readRecentReservations>;
}) {
  return (
    <section className="recent-reservations">
      <header>
        <div>
          <p className="eyebrow">On this device</p>
          <h3>Recent reservations</h3>
        </div>
      </header>
      {items.length ? (
        <div>
          {items.map((item) => (
            <Link to={`/reservations/${item.id}`} key={item.id}>
              <span>
                <strong>{item.eventName}</strong>
                <small>{reservationStatusLabel[item.status]}</small>
              </span>
              <ArrowRight size={16} />
            </Link>
          ))}
        </div>
      ) : (
        <p>Your recently opened reservations will appear here.</p>
      )}
    </section>
  );
}

function formatPreviewDate(value: string) {
  if (!value || Number.isNaN(new Date(value).getTime()))
    return "Set a date and time";
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}
