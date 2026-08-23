import {
  ArchiveX,
  ArrowDownToLine,
  Boxes,
  ChevronDown,
  Filter,
  Plus,
  Search,
  SlidersHorizontal,
  UserRound,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, isAbortError } from "../api";
import { useAuth } from "../auth";
import { AssetUnitStatusBreakdown } from "../components/AssetUnitStatus";
import {
  AssetPicture,
  Button,
  Dialog,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Notice,
  Select,
  Textarea,
  apiError,
  cx,
  formatDate,
} from "../components/ui";
import type { AssetSummary, ManagementArea } from "../types";

type AssetView = "ALL" | "MINE";

interface Filters {
  search: string;
  areaIds: string[];
  statuses: string[];
}

const assetUnitStatusOptions: Array<{
  value: keyof AssetSummary["unitCounts"];
  label: string;
  colorClass: string;
}> = [
  { value: "active", label: "Active", colorClass: "asset-status-swatch--active" },
  {
    value: "reserved",
    label: "Reserved",
    colorClass: "asset-status-swatch--reserved",
  },
  {
    value: "checkedOut",
    label: "Checked out",
    colorClass: "asset-status-swatch--checked-out",
  },
  { value: "broken", label: "Broken", colorClass: "asset-status-swatch--broken" },
  {
    value: "inRepair",
    label: "In repair",
    colorClass: "asset-status-swatch--in-repair",
  },
  { value: "lost", label: "Lost", colorClass: "asset-status-swatch--lost" },
  {
    value: "inactive",
    label: "Inactive",
    colorClass: "asset-status-swatch--inactive",
  },
];

export function AssetsPage() {
  const navigate = useNavigate();
  const { session, hasPermission, hasAreaPermission } = useAuth();
  const [view, setView] = useState<AssetView>("ALL");
  const [viewMode, setViewMode] = useState<"table" | "grid">("table");
  const [filters, setFilters] = useState<Filters>({
    search: "",
    areaIds: [],
    statuses: [],
  });
  const [draftSearch, setDraftSearch] = useState("");
  const [assets, setAssets] = useState<AssetSummary[]>([]);
  const [areas, setAreas] = useState<ManagementArea[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [adjustOperation, setAdjustOperation] = useState<
    "ADD" | "REMOVE" | null
  >(null);
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!filterOpen) return;
    const onPointerDown = (event: globalThis.PointerEvent) => {
      if (!filterRef.current?.contains(event.target as Node)) {
        setFilterOpen(false);
      }
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setFilterOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [filterOpen]);

  const isAssetEditable = useCallback(
    (asset: AssetSummary) =>
      Boolean(
        asset.capabilities.canEdit ||
        asset.capabilities.canManageUnits ||
        asset.capabilities.canDeactivate ||
        (hasAreaPermission &&
          hasAreaPermission("asset:update", asset.managementArea.id)) ||
        (hasAreaPermission &&
          hasAreaPermission("asset:delete", asset.managementArea.id)),
      ),
    [hasAreaPermission],
  );

  const isMyAsset = useCallback(
    (asset: AssetSummary) => {
      const isOwner = Boolean(
        session?.user?.id && asset.owner?.id === session.user.id,
      );
      const isEditable = isAssetEditable(asset);
      return isOwner || isEditable;
    },
    [session?.user?.id, isAssetEditable],
  );

  const displayAssets = useMemo(() => {
    let filtered = assets;
    if (view === "MINE") {
      filtered = filtered.filter(isMyAsset);
    }
    return [...filtered].sort((a, b) => {
      const aEditable = isAssetEditable(a);
      const bEditable = isAssetEditable(b);
      if (aEditable && !bEditable) return -1;
      if (!aEditable && bEditable) return 1;
      const dateA = new Date(a.updatedAt).getTime();
      const dateB = new Date(b.updatedAt).getTime();
      if (dateB !== dateA) return dateB - dateA;
      return a.name.localeCompare(b.name);
    });
  }, [assets, isAssetEditable, isMyAsset, view]);

  const load = useCallback(
    async (cursor?: string, append = false, signal?: AbortSignal) => {
      append ? setLoadingMore(true) : setLoading(true);
      setError(null);
      try {
        const response = await api.assets(
          {
            search: filters.search || undefined,
            areaId:
              filters.areaIds.length === 1 ? filters.areaIds[0] : undefined,
            cursor,
            limit: 50,
          },
          signal,
        );
        let list = response.data;
        if (filters.areaIds.length > 1) {
          list = list.filter((asset) =>
            filters.areaIds.includes(asset.managementArea.id),
          );
        }
        if (filters.statuses.length > 0) {
          const statusKeys = filters.statuses as Array<
            keyof AssetSummary["unitCounts"]
          >;
          list = list.filter((asset) =>
            statusKeys.some((status) => asset.unitCounts[status] > 0),
          );
        }
        setAssets((current) => {
          if (append) return [...current, ...list];
          const sameList =
            current.length === list.length &&
            current.every((asset, index) => asset.id === list[index].id);
          return sameList ? current : list;
        });
        setNextCursor(response.pageInfo.nextCursor);
        if (!append) {
          const visibleIds = new Set(list.map((asset) => asset.id));
          setSelected((current) => current.filter((id) => visibleIds.has(id)));
        }
      } catch (caught) {
        // A superseded request is not a load failure -- leave the current
        // list and error state alone, the newer request owns them now.
        if (isAbortError(caught)) return;
        setError(caught);
      } finally {
        if (!signal?.aborted) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [filters],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(undefined, false, controller.signal);
    return () => controller.abort();
  }, [load]);
  useEffect(() => {
    const controller = new AbortController();
    void api
      .areas("", controller.signal)
      .then((areaResponse) => {
        setAreas(areaResponse.data);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  const selectedAssets = useMemo(
    () => displayAssets.filter((asset) => selected.includes(asset.id)),
    [displayAssets, selected],
  );
  const selectable = displayAssets.filter(
    (asset) =>
      asset.capabilities.canManageUnits || asset.capabilities.canDeactivate,
  );
  const allSelected =
    selectable.length > 0 &&
    selectable.every((asset) => selected.includes(asset.id));

  if (!hasPermission("asset:view")) {
    return (
      <EmptyState
        title="You cannot view assets"
        description="This account does not have asset:view access in any management area."
      />
    );
  }

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    setFilters((current) => ({ ...current, search: draftSearch.trim() }));
  }

  useEffect(() => {
    const trimmed = draftSearch.trim();
    const timer = setTimeout(() => {
      setFilters((current) =>
        current.search === trimmed ? current : { ...current, search: trimmed },
      );
    }, 300);
    return () => clearTimeout(timer);
  }, [draftSearch]);

  function toggleAll() {
    setSelected(allSelected ? [] : selectable.map((asset) => asset.id));
  }

  function toggleOne(id: string) {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id],
    );
  }

  async function deactivateSelected() {
    try {
      await api.deactivateAssets(
        selectedAssets.map((asset) => ({
          assetId: asset.id,
          expectedUpdatedAt: asset.updatedAt,
        })),
      );
      setDeactivateOpen(false);
      setNotice(`${selectedAssets.length} assets disabled`);
      await load();
    } catch (caught) {
      setError(caught);
      setDeactivateOpen(false);
    }
  }

  const totalFilterCount = filters.areaIds.length + filters.statuses.length;
  const hasActiveFilters = totalFilterCount > 0;

  return (
    <div className="page-stack">
      {notice && <Notice>{notice}</Notice>}

      <div
        className="asset-view-tabs"
        role="tablist"
        aria-label="Asset view"
      >
        <button
          role="tab"
          aria-selected={view === "ALL"}
          className={cx(view === "ALL" && "is-active")}
          onClick={() => setView("ALL")}
        >
          <Boxes size={16} /> All assets
        </button>
        <button
          role="tab"
          aria-selected={view === "MINE"}
          className={cx(view === "MINE" && "is-active")}
          onClick={() => setView("MINE")}
        >
          <UserRound size={16} /> My assets
        </button>
        {hasPermission("asset:create") && (
          <Link
            style={{ marginLeft: "auto" }}
            className="button button--primary button--sm"
            to="/assets/new"
          >
            <Plus size={16} /> Add asset
          </Link>
        )}
      </div>

      <section className="toolbar" aria-label="Asset filters">
        <form className="search-box" onSubmit={submitSearch}>
          <Search size={17} />
          <input
            value={draftSearch}
            onChange={(event) => setDraftSearch(event.target.value)}
            placeholder="Search by name or description"
            aria-label="Search assets"
          />
          <button type="submit">Search</button>
        </form>
        <div className="toolbar__filters">
          <div className="calendar-filter-picker" ref={filterRef}>
            <button
              id="asset-filter-toggle"
              type="button"
              className={cx(
                "calendar-filter-btn",
                (hasActiveFilters || filterOpen) && "calendar-filter-btn--active",
              )}
              onClick={() => setFilterOpen((prev) => !prev)}
              aria-haspopup="dialog"
              aria-expanded={filterOpen}
              aria-label="Filter assets by management area and status"
              title={
                hasActiveFilters
                  ? `${totalFilterCount} filter${totalFilterCount > 1 ? "s" : ""} applied`
                  : "Filter by management area and status"
              }
            >
              <Filter size={13} />
              <span>Filters</span>
              {hasActiveFilters && (
                <span className="calendar-filter-btn__badge">
                  {totalFilterCount}
                </span>
              )}
              <ChevronDown
                size={14}
                className={cx(
                  "calendar-filter-btn__chevron",
                  filterOpen && "calendar-filter-btn__chevron--open",
                )}
                aria-hidden
              />
            </button>

            {filterOpen && (
              <div
                className="calendar-filter-popover"
                role="dialog"
                aria-label="Filter assets"
              >
                <div className="calendar-filter-popover__top">
                  <div className="calendar-filter-popover__title">
                    <Filter size={13} />
                    <strong>Filters</strong>
                  </div>
                  {hasActiveFilters && (
                    <button
                      type="button"
                      className="calendar-filter-popover__reset"
                      onClick={() => {
                        setFilters((current) => ({
                          ...current,
                          areaIds: [],
                          statuses: [],
                        }));
                      }}
                    >
                      Clear all
                    </button>
                  )}
                </div>

                <div className="calendar-filter-popover__columns">
                  <section className="calendar-filter-popover__section">
                    <div className="calendar-filter-popover__section-header">
                      <span>Management areas</span>
                      <div className="calendar-filter-popover__actions">
                        <button
                          type="button"
                          className="calendar-filter-popover__action"
                          onClick={() =>
                            setFilters((current) => ({
                              ...current,
                              areaIds: [],
                            }))
                          }
                        >
                          All
                        </button>
                        {filters.areaIds.length > 0 && (
                          <button
                            type="button"
                            className="calendar-filter-popover__action"
                            onClick={() =>
                              setFilters((current) => ({
                                ...current,
                                areaIds: [],
                              }))
                            }
                          >
                            Clear
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="calendar-filter-popover__list">
                      {areas.length === 0 ? (
                        <p className="calendar-filter-popover__empty">
                          No management areas found
                        </p>
                      ) : (
                        areas.map((area) => {
                          const checked = filters.areaIds.includes(area.id);
                          return (
                            <label
                              key={area.id}
                              className={cx(
                                "workspace-filter-checkbox-item",
                                checked &&
                                  "workspace-filter-checkbox-item--checked",
                              )}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => {
                                  setFilters((current) => ({
                                    ...current,
                                    areaIds: current.areaIds.includes(area.id)
                                      ? current.areaIds.filter(
                                          (id) => id !== area.id,
                                        )
                                      : [...current.areaIds, area.id],
                                  }));
                                }}
                                aria-label={area.name}
                              />
                              <span className="workspace-filter-checkbox-item__name">
                                {area.name}
                              </span>
                            </label>
                          );
                        })
                      )}
                    </div>
                  </section>

                  <section className="calendar-filter-popover__section">
                    <div className="calendar-filter-popover__section-header">
                      <span>Unit statuses</span>
                      <div className="calendar-filter-popover__actions">
                        <button
                          type="button"
                          className="calendar-filter-popover__action"
                          onClick={() =>
                            setFilters((current) => ({
                              ...current,
                              statuses: [],
                            }))
                          }
                        >
                          All
                        </button>
                        {filters.statuses.length > 0 && (
                          <button
                            type="button"
                            className="calendar-filter-popover__action"
                            onClick={() =>
                              setFilters((current) => ({
                                ...current,
                                statuses: [],
                              }))
                            }
                          >
                            Clear
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="calendar-filter-popover__list">
                      {assetUnitStatusOptions.map((option) => {
                        const checked = filters.statuses.includes(option.value);
                        return (
                          <label
                            key={option.value}
                            className={cx(
                              "workspace-filter-checkbox-item",
                              checked &&
                                "workspace-filter-checkbox-item--checked",
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => {
                                setFilters((current) => ({
                                  ...current,
                                  statuses: current.statuses.includes(
                                    option.value,
                                  )
                                    ? current.statuses.filter(
                                        (val) => val !== option.value,
                                      )
                                    : [...current.statuses, option.value],
                                }));
                              }}
                              aria-label={option.label}
                            />
                            {option.colorClass ? (
                              <i
                                className={cx(
                                  "workspace-filter-checkbox-item__swatch",
                                  option.colorClass,
                                )}
                                aria-hidden
                              />
                            ) : null}
                            <span className="workspace-filter-checkbox-item__name">
                              {option.label}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </section>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {selected.length > 0 && (
        <section className="selection-bar" aria-live="polite">
          <span>
            <strong>{selected.length}</strong> selected
          </span>
          <div>
            {selectedAssets.every(
              (asset) => asset.capabilities.canManageUnits,
            ) && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setAdjustOperation("ADD")}
              >
                <ArrowDownToLine size={16} />
                Register units
              </Button>
            )}
            {selectedAssets.every(
              (asset) => asset.capabilities.canDeactivate && asset.isActive,
            ) && (
              <Button
                variant="danger"
                size="sm"
                onClick={() => setDeactivateOpen(true)}
              >
                <ArchiveX size={16} />
                Disable
              </Button>
            )}
          </div>
        </section>
      )}

      {loading && assets.length === 0 ? (
        <AssetTableSkeleton />
      ) : error ? (
        <ErrorState error={error} onRetry={() => void load()} />
      ) : displayAssets.length === 0 ? (
        <EmptyState
          title={
            view === "MINE" ? "No managed assets found" : "No assets found"
          }
          description={
            view === "MINE"
              ? "You do not own or manage any assets matching the current filters."
              : filters.search || filters.areaIds.length > 0
                ? "Try changing your search or filters."
                : "Start by adding the first asset in your area."
          }
          action={
            hasPermission("asset:create") ? (
              <Link
                className="button button--primary button--md"
                to="/assets/new"
              >
                <Plus size={16} />
                Add asset
              </Link>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="data-table-wrap">
            <table className="data-table asset-table">
              <thead>
                <tr>
                  <th className="cell-check">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      disabled={selectable.length === 0}
                      onChange={toggleAll}
                      aria-label="Select all"
                    />
                  </th>
                  <th>Asset</th>
                  <th>Management area</th>
                  <th>Status</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {displayAssets.map((asset) => {
                  const isSelectable =
                    asset.capabilities.canManageUnits ||
                    asset.capabilities.canDeactivate;
                  const isSelected = selected.includes(asset.id);
                  return (
                    <tr
                      key={asset.id}
                      className={cx(
                        "asset-table-row--clickable",
                        isSelected && "asset-table-row--selected",
                      )}
                      onClick={(event) => {
                        if (
                          (event.target as Element).closest("a, button, input")
                        ) {
                          return;
                        }
                        navigate(`/assets/${asset.id}`);
                      }}
                    >
                      <td className="cell-check">
                        <div
                          className={cx(
                            "cell-check__hit",
                            !isSelectable && "cell-check__hit--disabled",
                          )}
                          onClick={(event) => {
                            event.stopPropagation();
                            if (!isSelectable) return;
                            toggleOne(asset.id);
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            disabled={!isSelectable}
                            readOnly
                            aria-label={`Select ${asset.name}`}
                          />
                        </div>
                      </td>
                      <td>
                        <div className="asset-name-cell">
                          <span>
                            <strong>{asset.name}</strong>
                            <small className="mono">
                              P/N: {asset.partNumber || "No part number"}
                            </small>
                          </span>
                        </div>
                      </td>
                      <td>
                        <strong className="table-primary">
                          {asset.managementArea.name}
                        </strong>
                      </td>
                      <td>
                        <AssetUnitStatusBreakdown unitCounts={asset.unitCounts} />
                      </td>
                      <td className="mono table-date">
                        {formatDate(asset.updatedAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="asset-card-list">
            {displayAssets.map((asset) => {
              const isSelectable =
                asset.capabilities.canManageUnits ||
                asset.capabilities.canDeactivate;
              const isSelected = selected.includes(asset.id);
              return (
                <article
                  className={cx(
                    "asset-card",
                    "asset-card--clickable",
                    isSelected && "asset-card--selected",
                  )}
                  key={asset.id}
                  onClick={(event) => {
                    if (
                      (event.target as Element).closest("a, button, input")
                    ) {
                      return;
                    }
                    navigate(`/assets/${asset.id}`);
                  }}
                >
                  <div className="asset-card__body">
                    <div
                      className={cx(
                        "cell-check__hit",
                        !isSelectable && "cell-check__hit--disabled",
                      )}
                      onClick={(event) => {
                        event.stopPropagation();
                        if (!isSelectable) return;
                        toggleOne(asset.id);
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        disabled={!isSelectable}
                        readOnly
                        aria-label={`Select ${asset.name}`}
                      />
                    </div>
                    <div className="asset-card__info">
                      <strong>{asset.name}</strong>
                      <span>{asset.managementArea.name}</span>
                      <span className="mono">
                        P/N: {asset.partNumber || "No part number"}
                      </span>
                    </div>
                  </div>
                  <div className="asset-card__footer">
                    <AssetUnitStatusBreakdown unitCounts={asset.unitCounts} />
                  </div>
                </article>
              );
            })}
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

      <InventoryDialog
        assets={selectedAssets}
        operation={adjustOperation}
        onClose={() => setAdjustOperation(null)}
        onSuccess={async (message) => {
          setAdjustOperation(null);
          setNotice(message);
          await load();
        }}
      />
      <Dialog
        open={deactivateOpen}
        title="Disable selected assets?"
        description="The assets will remain in the history but should not be used in new reservations."
        onClose={() => setDeactivateOpen(false)}
      >
        <div className="confirm-list">
          {selectedAssets.map((asset) => (
            <span key={asset.id}>
              <ArchiveX size={15} />
              {asset.name}
            </span>
          ))}
        </div>
        <div className="dialog__actions">
          <Button variant="quiet" onClick={() => setDeactivateOpen(false)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={() => void deactivateSelected()}>
            Disable {selectedAssets.length} assets
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

function InventoryDialog({
  assets,
  operation,
  onClose,
  onSuccess,
}: {
  assets: AssetSummary[];
  operation: "ADD" | "REMOVE" | null;
  onClose: () => void;
  onSuccess: (message: string) => void | Promise<void>;
}) {
  const assetKey = assets.map((asset) => asset.id).join(",");
  const [serialsByAsset, setSerialsByAsset] = useState<Record<string, string>>(
    {},
  );
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (operation) {
      setSerialsByAsset(Object.fromEntries(assets.map((asset) => [asset.id, ""])));
      setReason("");
      setError("");
    }
  }, [operation, assetKey]);

  const parsedByAsset = Object.fromEntries(
    assets.map((asset) => [
      asset.id,
      (serialsByAsset[asset.id] ?? "")
        .split(/[\n,]/)
        .map((value) => value.trim())
        .filter(Boolean),
    ]),
  );
  const totalUnits = Object.values(parsedByAsset).reduce(
    (sum, serials) => sum + serials.length,
    0,
  );

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!operation || totalUnits === 0) return;
    setSubmitting(true);
    setError("");
    try {
      await Promise.all(
        assets
          .filter((asset) => parsedByAsset[asset.id]!.length > 0)
          .map((asset) =>
            api.registerAssetUnits(
              asset.id,
              parsedByAsset[asset.id]!,
              reason || undefined,
            ),
          ),
      );
      await onSuccess(`Registered ${totalUnits} unit(s)`);
    } catch (caught) {
      setError(apiError(caught).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={Boolean(operation)}
      title="Register units"
      description="Enter one serial number per line for each asset."
      onClose={onClose}
      wide
    >
      <form onSubmit={submit} className="form-stack">
        {error && (
          <div className="form-alert" role="alert">
            {error}
          </div>
        )}
        <div className="adjustment-lines">
          {assets.map((asset) => (
            <div className="adjustment-line" key={asset.id}>
              <AssetPicture src={asset.pictureUrl} name={asset.name} />
              <span>
                <strong>{asset.name}</strong>
                <small>Current: {asset.totalQuantity} units</small>
              </span>
              <Field label="Serial numbers">
                <Textarea
                  value={serialsByAsset[asset.id] ?? ""}
                  onChange={(event) =>
                    setSerialsByAsset((current) => ({
                      ...current,
                      [asset.id]: event.target.value,
                    }))
                  }
                  placeholder={"One per line, e.g.\nSN-001\nSN-002"}
                />
              </Field>
            </div>
          ))}
        </div>
        <div className="form-grid form-grid--2">
          <Field label="Reason for each entry">
            <Input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="For example, new stock received"
              maxLength={2000}
            />
          </Field>
        </div>
        <div className="dialog__actions">
          <Button variant="quiet" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting} disabled={totalUnits === 0}>
            <ArrowDownToLine size={16} />
            Register {totalUnits || ""} unit{totalUnits === 1 ? "" : "s"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function AssetTableSkeleton() {
  return (
    <div className="table-skeleton" aria-label="Loading assets">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index}>
          <span />
          <span />
          <span />
          <span />
        </div>
      ))}
    </div>
  );
}

