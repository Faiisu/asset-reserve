import {
  ArrowRight,
  ArrowLeft,
  Check,
  Plus,
  Save,
  Search,
  Send,
  Trash2,
  X,
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
  Notice,
  Textarea,
  cx,
} from "../components/ui";
import {
  defaultReservationWindow,
  rememberReservation,
  toLocalDateTime,
} from "../reservations";
import type { AssetSummary } from "../types";

type SelectedAsset = { asset: AssetSummary; quantity: number };
const MAX_RESERVATION_ITEM_QUANTITY = 200;
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
  const availabilityWindow = useMemo(() => {
    const start = new Date(startAt);
    const end = new Date(endAt);
    if (
      !startAt ||
      !endAt ||
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime()) ||
      end <= start
    ) {
      return null;
    }
    return { from: start.toISOString(), to: end.toISOString() };
  }, [endAt, startAt]);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      setLoadingAssets(true);
      void api
        .assets({
          search: search.trim(),
          isActive: true,
          from: availabilityWindow?.from,
          to: availabilityWindow?.to,
          limit: 100,
        })
        .then((response) => active && setAssets(response.data))
        .catch((caught) => active && setError(caught))
        .finally(() => active && setLoadingAssets(false));
    }, 180);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [availabilityWindow?.from, availabilityWindow?.to, search]);

  useEffect(() => {
    if (!assets.length) return;
    const byId = new Map(assets.map((asset) => [asset.id, asset] as const));
    setSelected((current) =>
      current.flatMap((item) => {
        const updated = byId.get(item.asset.id);
        if (!updated) return [item];
        if (updated.availableQuantity <= 0) return [];
        return [
          {
            asset: updated,
            quantity: Math.min(
              item.quantity,
              updated.availableQuantity,
              MAX_RESERVATION_ITEM_QUANTITY,
            ),
          },
        ];
      }),
    );
  }, [assets]);

  useEffect(() => {
    if (!hasPermission("reservation:create")) return;
    if (!requestedAssetIds.length || loadingAssets) return;
    let active = true;
    const listedById = new Map(
      assets.map((asset) => [asset.id, asset] as const),
    );
    const listed = requestedAssetIds.flatMap((assetId) => {
      const asset = listedById.get(assetId);
      return asset !== undefined &&
        asset.availableQuantity > 0 &&
        hasAreaPermission("reservation:create", asset.managementArea.id)
        ? [asset]
        : [];
    });
    const missingIds = requestedAssetIds.filter(
      (assetId) => !listedById.has(assetId),
    );
    void Promise.allSettled(
      missingIds.map((assetId) => api.asset(assetId)),
    ).then((results) => {
      if (!active) return;
      const imported = [
        ...listed,
        ...results.flatMap((result) =>
          result.status === "fulfilled" &&
          result.value.isActive &&
          result.value.availableQuantity > 0 &&
          hasAreaPermission(
            "reservation:create",
            result.value.managementArea.id,
          )
            ? [result.value]
            : [],
        ),
      ];
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
  }, [assets, loadingAssets, requestedAssetKey]);

  const selectedIds = new Set(selected.map((item) => item.asset.id));
  const reservableAssets = assets
    .filter((asset) =>
      hasAreaPermission("reservation:create", asset.managementArea.id),
    )
    .sort(
      (left, right) =>
        Number(left.availableQuantity <= 0) -
        Number(right.availableQuantity <= 0),
    );

  function addAsset(asset: AssetSummary) {
    if (selectedIds.has(asset.id) || asset.availableQuantity <= 0) return;
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
    if (selected.length === 0) {
      setFields({ items: "Select at least one asset for this reservation." });
      return;
    }
    if (
      selected.some(
        (item) =>
          !Number.isInteger(item.quantity) ||
          item.quantity < 1 ||
          item.quantity > MAX_RESERVATION_ITEM_QUANTITY ||
          item.quantity > item.asset.availableQuantity,
      )
    ) {
      setFields({
        items:
          "Each quantity must be a whole number within the available amount for this time.",
      });
      return;
    }
    const startInvalid = !startAt || Number.isNaN(new Date(startAt).getTime());
    const endInvalid = !endAt || Number.isNaN(new Date(endAt).getTime());
    if (startInvalid || endInvalid) {
      setFields({
        ...(startInvalid ? { startAt: "Set a valid start time." } : {}),
        ...(endInvalid ? { endAt: "Set a valid end time." } : {}),
      });
      return;
    }
    if (new Date(endAt) <= new Date(startAt)) {
      setFields({ endAt: "End time must be later than start time." });
      return;
    }
    const now = new Date(Date.now() - 60_000);
    if (new Date(startAt) < now) {
      setFields({ startAt: "Reservation start time cannot be in the past." });
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
      <div className="page-stack page-stack--form reservation-page">
        <div className="reservation-review-landing">
          <Notice tone="warning">
            Your account doesn't have permission to create new reservations. You
            can still open an existing one below if you have its ID.
          </Notice>
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
        </div>
      </div>
    );
  }

  return (
    <div className="page-stack page-stack--form reservation-page">
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
                  min={toLocalDateTime(new Date().toISOString())}
                  onChange={(event) => setStartAt(event.target.value)}
                  required
                />
              </Field>
              <Field label="Ends" required error={fields.endAt}>
                <Input
                  type="datetime-local"
                  value={endAt}
                  min={startAt || toLocalDateTime(new Date().toISOString())}
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
                {selected.map(({ asset, quantity }, index) => {
                  const maximumQuantity = Math.min(
                    asset.availableQuantity,
                    MAX_RESERVATION_ITEM_QUANTITY,
                  );
                  const quantityInvalid =
                    !Number.isInteger(quantity) ||
                    quantity < 1 ||
                    quantity > maximumQuantity;
                  return (
                    <div className="manifest-row" key={asset.id}>
                      <span className="manifest-row__number">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <AssetPicture src={asset.pictureUrl} name={asset.name} />
                      <div className="manifest-row__asset">
                        <strong>{asset.name}</strong>
                        <span>
                          {asset.managementArea.name} ·{" "}
                          {asset.availableQuantity} available for this time
                        </span>
                      </div>
                      <Field
                        label="Quantity"
                        error={
                          quantityInvalid
                            ? `Enter a whole number from 1 to ${maximumQuantity}`
                            : undefined
                        }
                      >
                        <Input
                          className="manifest-row__quantity"
                          type="number"
                          min={1}
                          max={maximumQuantity}
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
                            current.filter(
                              (item) => item.asset.id !== asset.id,
                            ),
                          )
                        }
                      >
                        <Trash2 size={17} />
                      </button>
                    </div>
                  );
                })}
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
                  reservableAssets.map((asset) => {
                    const selected = selectedIds.has(asset.id);
                    const fullyBooked = asset.availableQuantity <= 0;
                    return (
                      <button
                        type="button"
                        className={cx(
                          "asset-picker__item",
                          fullyBooked && "asset-picker__item--unavailable",
                        )}
                        key={asset.id}
                        disabled={selected || fullyBooked}
                        onClick={() => addAsset(asset)}
                      >
                        <AssetPicture
                          src={asset.pictureUrl}
                          name={asset.name}
                        />
                        <span>
                          <strong>{asset.name}</strong>
                          <small>
                            {asset.managementArea.name} ·{" "}
                            {fullyBooked
                              ? "Fully booked for this time"
                              : `${asset.availableQuantity} of ${asset.totalQuantity} available for this time`}
                          </small>
                        </span>
                        {selected ? (
                          <Check size={17} />
                        ) : fullyBooked ? (
                          <X size={16} />
                        ) : (
                          <Plus size={17} />
                        )}
                      </button>
                    );
                  })
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
      </form>
    </div>
  );
}
