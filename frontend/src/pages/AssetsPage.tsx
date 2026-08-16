import {
  ArchiveX,
  ArrowDownToLine,
  ArrowUpFromLine,
  Eye,
  Filter,
  Plus,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import {
  AssetPicture,
  Button,
  CheckboxDropdownFilter,
  Dialog,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Notice,
  Select,
  StatusBadge,
  Textarea,
  WorkspaceCheckboxFilter,
  apiError,
  cx,
  formatDate,
} from "../components/ui";
import type { AssetSummary, ManagementArea } from "../types";

interface Filters {
  search: string;
  areaIds: string[];
  statuses: string[];
}

export function AssetsPage() {
  const { hasPermission } = useAuth();
  const [viewMode, setViewMode] = useState<"table" | "grid">("table");
  const [filters, setFilters] = useState<Filters>({
    search: "",
    areaIds: [],
    statuses: ["ACTIVE"],
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

  const load = useCallback(
    async (cursor?: string, append = false) => {
      append ? setLoadingMore(true) : setLoading(true);
      setError(null);
      try {
        const response = await api.assets({
          search: filters.search || undefined,
          areaId: filters.areaIds.length === 1 ? filters.areaIds[0] : undefined,
          status:
            filters.statuses.length === 1 &&
            ["ACTIVE", "BROKEN", "LOST"].includes(filters.statuses[0].toUpperCase())
              ? (filters.statuses[0].toUpperCase() as "ACTIVE" | "BROKEN" | "LOST")
              : undefined,
          cursor,
          limit: 20,
        });
        let list = response.data;
        if (filters.areaIds.length > 1) {
          list = list.filter((asset) =>
            filters.areaIds.includes(asset.managementArea.id),
          );
        }
        if (filters.statuses.length > 0) {
          list = list.filter((asset) => {
            const assetStatus = (asset.status || (asset.isActive ? "ACTIVE" : "INACTIVE")).toUpperCase();
            return filters.statuses.some(
              (s) =>
                s.toUpperCase() === assetStatus ||
                (s.toLowerCase() === "active" && asset.isActive && assetStatus === "ACTIVE") ||
                (s.toLowerCase() === "inactive" && !asset.isActive),
            );
          });
        }
        setAssets((current) =>
          append ? [...current, ...list] : list,
        );
        setNextCursor(response.pageInfo.nextCursor);
        if (!append) setSelected([]);
      } catch (caught) {
        setError(caught);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [filters],
  );

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    void api
      .areas()
      .then((areaResponse) => {
        setAreas(areaResponse.data);
      })
      .catch(() => undefined);
  }, []);

  const selectedAssets = useMemo(
    () => assets.filter((asset) => selected.includes(asset.id)),
    [assets, selected],
  );
  const selectable = assets.filter(
    (asset) =>
      asset.capabilities.canAdjustQuantity || asset.capabilities.canDeactivate,
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

  return (
    <div className="page-stack">
      {notice && <Notice>{notice}</Notice>}

      <section className="toolbar" aria-label="Asset filters">
        <form className="search-box" onSubmit={submitSearch}>
          <Search size={18} aria-hidden />
          <input
            value={draftSearch}
            onChange={(event) => setDraftSearch(event.target.value)}
            placeholder="Search by name or description"
            aria-label="Search assets"
          />
          <button type="submit">Search</button>
        </form>
        <div className="toolbar__filters">
          <span className="toolbar__filter-label">
            <Filter size={15} />
            Filters
          </span>
          <WorkspaceCheckboxFilter
            areas={areas}
            selectedIds={filters.areaIds}
            onChange={(ids) =>
              setFilters((current) => ({
                ...current,
                areaIds: ids,
              }))
            }
          />
          <CheckboxDropdownFilter
            label="Statuses"
            allLabel="All statuses"
            options={[
              { value: "ACTIVE", label: "Active" },
              { value: "BROKEN", label: "Broken" },
              { value: "LOST", label: "Lost" },
              { value: "INACTIVE", label: "Inactive" },
            ]}
            selectedValues={filters.statuses}
            onChange={(statuses) =>
              setFilters((current) => ({
                ...current,
                statuses,
              }))
            }
            ariaLabel="Filter statuses"
          />
        </div>
        {hasPermission("asset:create") && (
          <Link
            className="button button--primary button--md"
            to="/assets/new"
          >
            <Plus size={17} />
            Add asset
          </Link>
        )}
      </section>

      {selected.length > 0 && (
        <section className="selection-bar" aria-live="polite">
          <span>
            <strong>{selected.length}</strong> selected
          </span>
          <div>
            {selectedAssets.every(
              (asset) => asset.capabilities.canAdjustQuantity,
            ) && (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setAdjustOperation("ADD")}
                >
                  <ArrowDownToLine size={16} />
                  Add stock
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setAdjustOperation("REMOVE")}
                >
                  <ArrowUpFromLine size={16} />
                  Remove stock
                </Button>
              </>
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

      {loading ? (
        <AssetTableSkeleton />
      ) : error ? (
        <ErrorState error={error} onRetry={() => void load()} />
      ) : assets.length === 0 ? (
        <EmptyState
          title="No assets found"
          description={
            filters.search || filters.areaIds.length > 0
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
                  <th>Workspace</th>
                  <th className="cell-number">Total</th>
                  <th>Status</th>
                  <th>Updated</th>
                  <th className="cell-action">Action</th>
                </tr>
              </thead>
              <tbody>
                {assets.map((asset) => {
                  const isSelectable =
                    asset.capabilities.canAdjustQuantity ||
                    asset.capabilities.canDeactivate;
                  const isSelected = selected.includes(asset.id);
                  return (
                    <tr
                      key={asset.id}
                      className={cx(
                        isSelectable && "asset-table-row--selectable",
                        isSelected && "asset-table-row--selected",
                      )}
                      onClick={(event) => {
                        if (
                          !isSelectable ||
                          (event.target as Element).closest("a, button, input")
                        ) {
                          return;
                        }
                        toggleOne(asset.id);
                      }}
                    >
                      <td className="cell-check">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={!isSelectable}
                          onChange={() => toggleOne(asset.id)}
                          aria-label={`Select ${asset.name}`}
                        />
                      </td>
                      <td>
                        <div className="asset-name-cell">
                          <AssetPicture
                            src={asset.pictureUrl}
                            name={asset.name}
                          />
                          <span>
                            <strong>{asset.name}</strong>
                            <small>
                              {asset.description || "No description"}
                            </small>
                          </span>
                        </div>
                      </td>
                      <td>
                        <strong className="table-primary">
                          {asset.managementArea.name}
                        </strong>
                      </td>
                      <td className="cell-number">
                        <strong className="quantity">
                          {asset.totalQuantity}
                        </strong>
                        <small>units</small>
                      </td>
                      <td>
                        <AssetMasterStatusBadge
                          status={asset.status}
                          isActive={asset.isActive}
                        />
                      </td>
                      <td className="mono table-date">
                        {formatDate(asset.updatedAt)}
                      </td>
                      <td className="cell-action">
                        <Link
                          className="button button--secondary button--sm"
                          to={`/assets/${asset.id}`}
                        >
                          <Eye size={15} /> View
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="asset-card-list">
            {assets.map((asset) => {
              const isSelectable =
                asset.capabilities.canAdjustQuantity ||
                asset.capabilities.canDeactivate;
              const isSelected = selected.includes(asset.id);
              return (
                <article
                  className={cx(
                    "asset-card",
                    isSelectable && "asset-card--selectable",
                    isSelected && "asset-card--selected",
                  )}
                  key={asset.id}
                  onClick={(event) => {
                    if (
                      !isSelectable ||
                      (event.target as Element).closest("a, button, input")
                    ) {
                      return;
                    }
                    toggleOne(asset.id);
                  }}
                >
                  <div className="asset-card__body">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={!isSelectable}
                      onChange={() => toggleOne(asset.id)}
                      aria-label={`Select ${asset.name}`}
                    />
                    <AssetPicture src={asset.pictureUrl} name={asset.name} />
                    <div className="asset-card__info">
                      <strong>{asset.name}</strong>
                      <span>{asset.managementArea.name}</span>
                    </div>
                  </div>
                  <div className="asset-card__footer">
                    <div className="asset-card__numbers">
                      <span>
                        <small>Total</small>
                        <strong>{asset.totalQuantity}</strong>
                      </span>
                      <AssetMasterStatusBadge
                        status={asset.status}
                        isActive={asset.isActive}
                      />
                    </div>
                    <Link
                      className="button button--secondary button--sm"
                      to={`/assets/${asset.id}`}
                    >
                      <Eye size={15} /> View
                    </Link>
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
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [reason, setReason] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (operation) {
      setQuantities(Object.fromEntries(assets.map((asset) => [asset.id, 1])));
      setReason("");
      setDescription("");
      setError("");
    }
  }, [operation, assetKey]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!operation) return;
    setSubmitting(true);
    setError("");
    try {
      await api.adjustInventory(
        operation,
        assets.map((asset) => ({
          assetId: asset.id,
          quantity: quantities[asset.id] || 1,
          reason: reason || undefined,
        })),
        description || undefined,
      );
      await onSuccess(
        `${operation === "ADD" ? "Added stock for" : "Removed stock from"} ${assets.length} assets`,
      );
    } catch (caught) {
      setError(apiError(caught).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={Boolean(operation)}
      title={operation === "ADD" ? "Add stock" : "Remove stock"}
      description="All changes will be recorded as a single transaction batch."
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
              <Field label="Quantity">
                <Input
                  type="number"
                  min={1}
                  max={operation === "REMOVE" ? asset.totalQuantity : undefined}
                  value={quantities[asset.id] ?? 1}
                  onChange={(event) =>
                    setQuantities((current) => ({
                      ...current,
                      [asset.id]: Number(event.target.value),
                    }))
                  }
                  required
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
          <Field label="Batch description">
            <Textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Additional details about this adjustment"
              maxLength={2000}
            />
          </Field>
        </div>
        <div className="dialog__actions">
          <Button variant="quiet" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting}>
            {operation === "ADD" ? (
              <ArrowDownToLine size={16} />
            ) : (
              <ArrowUpFromLine size={16} />
            )}
            Confirm quantity adjustment
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

function AssetMasterStatusBadge({
  status,
  isActive,
}: {
  status?: string;
  isActive: boolean;
}) {
  const normStatus = (status || (isActive ? "ACTIVE" : "INACTIVE")).toUpperCase();
  if (!isActive || normStatus === "INACTIVE") {
    return (
      <span className="status-badge status-badge--inactive">
        <span />
        Disabled
      </span>
    );
  }
  if (normStatus === "BROKEN") {
    return (
      <span className="status-badge status-badge--broken">
        <span />
        Broken
      </span>
    );
  }
  if (normStatus === "LOST") {
    return (
      <span className="status-badge status-badge--lost">
        <span />
        Lost
      </span>
    );
  }
  return (
    <span className="status-badge status-badge--active">
      <span />
      Active
    </span>
  );
}
