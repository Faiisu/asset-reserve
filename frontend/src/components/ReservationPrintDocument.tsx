import {
  Printer,
  X,
  FileText,
} from "lucide-react";
import { formatDate } from "./ui";
import { reservationDuration, reservationStatusLabel } from "../reservations";
import type { ReservationDetail } from "../types";

export interface ReservationPrintDocumentProps {
  reservation: ReservationDetail;
  onClose?: () => void;
  isModal?: boolean;
}

export function ReservationPrintDocument({
  reservation,
  onClose,
  isModal = false,
}: ReservationPrintDocumentProps) {
  const handlePrint = () => {
    window.print();
  };

  const totalRequestedUnits = reservation.items.reduce(
    (acc, it) => acc + it.quantity,
    0,
  );
  const totalApprovedUnits = reservation.items
    .filter((it) => it.status === "APPROVED" || it.approval?.status === "APPROVED")
    .reduce((acc, it) => acc + (it.quantity || 0), 0);

  const hasReturns = Boolean(
    reservation.returns && reservation.returns.length > 0,
  );

  // Return totals across all return slips -- condition is decided per serial
  // unit (ReturnItemUnit.condition), not as an item-level quantity.
  const countUnitsByCondition = (condition: "GOOD" | "BROKEN" | "LOST") =>
    hasReturns
      ? reservation.returns.reduce(
          (acc, ret) =>
            acc +
            ret.items.reduce(
              (s, it) =>
                s + it.units.filter((unit) => unit.condition === condition).length,
              0,
            ),
          0,
        )
      : 0;

  const totalReturnedUnits = countUnitsByCondition("GOOD");
  const totalBrokenUnits = countUnitsByCondition("BROKEN");
  const totalLostUnits = countUnitsByCondition("LOST");

  const firstApprover = reservation.items.find(
    (item) => item.approval?.approver,
  )?.approval?.approver;

  const firstReturn = reservation.returns?.[0];

  const nowFormatted = formatDate(new Date().toISOString(), true);

  return (
    <div
      className={
        isModal
          ? "res-print-modal-overlay"
          : "printable-document-container"
      }
      role={isModal ? "dialog" : undefined}
      aria-modal={isModal ? true : undefined}
      aria-label="Reservation and Return Document Preview"
    >
      {isModal && (
        <div className="res-print-modal-toolbar no-print">
          <div className="res-print-modal-toolbar__title">
            <FileText size={18} />
            <span>Official Manifest Document Preview</span>
          </div>
          <div className="res-print-modal-toolbar__actions">
            <button
              type="button"
              className="button button--primary button--sm"
              onClick={handlePrint}
              id="print-document-action-btn"
            >
              <Printer size={15} />
              <span>Print / Save PDF</span>
            </button>
            {onClose && (
              <button
                type="button"
                className="button button--secondary button--sm"
                onClick={onClose}
                aria-label="Close document preview"
              >
                <X size={15} />
                <span>Close</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Main Printable Document Sheet (A4 format) */}
      <div className="res-print-sheet printable-document" id="printable-manifest-sheet">
        {/* Document Header */}
        <header className="res-print-header">
          <div className="res-print-header__brand">
            <div className="res-print-logo-mark">
              <span>ADVANTECH</span>
            </div>
            <div className="res-print-brand-text">
              <span className="res-print-org">ADVANTECH CORPORATION</span>
              <span className="res-print-system">Asset Reservation & Logistics Management</span>
            </div>
          </div>

          <div className="res-print-header__title-block">
            <h1 className="res-print-title">EQUIPMENT DISPATCH & RETURN MANIFEST</h1>
            <span className="res-print-subtitle">
              Official Custody, Dispatch Clearance & Return Inspection Record
            </span>
          </div>

          <div className="res-print-header__meta-box">
            <div className="res-print-meta-row">
              <span className="res-print-meta-lbl">Slip Ref No:</span>
              <strong className="res-print-meta-val res-print-ref-code">
                RES-{reservation.id.slice(0, 8).toUpperCase()}
              </strong>
            </div>
            <div className="res-print-meta-row">
              <span className="res-print-meta-lbl">System UUID:</span>
              <span className="res-print-meta-val res-print-mono">{reservation.id}</span>
            </div>
            <div className="res-print-meta-row">
              <span className="res-print-meta-lbl">Status:</span>
              <span className={`res-print-status-tag res-print-status-tag--${reservation.status.toLowerCase()}`}>
                {reservationStatusLabel[reservation.status] ?? reservation.status}
              </span>
            </div>
            <div className="res-print-meta-row">
              <span className="res-print-meta-lbl">Generated On:</span>
              <span className="res-print-meta-val">{nowFormatted}</span>
            </div>
          </div>
        </header>

        <div className="res-print-divider" />

        {/* Section: Event & Custody Information */}
        <section className="res-print-section print-avoid-break">
          <h2 className="res-print-section-title">
            <span className="res-print-sec-num">1</span>
            <span>Reservation & Event Overview</span>
          </h2>

          <div className="res-print-grid-two">
            <div className="res-print-panel">
              <div className="res-print-field">
                <span className="res-print-field-label">Event / Activity Name:</span>
                <span className="res-print-field-value res-print-strong">
                  {reservation.eventName}
                </span>
              </div>
              <div className="res-print-field">
                <span className="res-print-field-label">Purpose / Description:</span>
                <span className="res-print-field-value">
                  {reservation.description || "No specific event notes provided."}
                </span>
              </div>
              <div className="res-print-field">
                <span className="res-print-field-label">Booking Window:</span>
                <span className="res-print-field-value">
                  {formatDate(reservation.startAt, true)} — {formatDate(reservation.endAt, true)}
                </span>
              </div>
              <div className="res-print-field">
                <span className="res-print-field-label">Scheduled Duration:</span>
                <span className="res-print-field-value">
                  {reservationDuration(reservation.startAt, reservation.endAt)}
                </span>
              </div>
            </div>

            <div className="res-print-panel">
              <div className="res-print-field">
                <span className="res-print-field-label">Requester (Borrower):</span>
                <span className="res-print-field-value res-print-strong">
                  {reservation.requester.name ?? "Unnamed User"}
                </span>
              </div>
              <div className="res-print-field">
                <span className="res-print-field-label">Borrower Email:</span>
                <span className="res-print-field-value">
                  {reservation.requester.email ?? "N/A"}
                </span>
              </div>
              <div className="res-print-field">
                <span className="res-print-field-label">Event Team / Participants:</span>
                <span className="res-print-field-value">
                  {reservation.participants.length > 0
                    ? reservation.participants
                        .map((p) => p.name || p.email)
                        .filter(Boolean)
                        .join(", ")
                    : "Single requester booking"}
                </span>
              </div>
              <div className="res-print-field">
                <span className="res-print-field-label">Request Date:</span>
                <span className="res-print-field-value">
                  {formatDate(reservation.createdAt, true)}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Section: Equipment Dispatch & Approvals Manifest */}
        <section className="res-print-section print-avoid-break">
          <h2 className="res-print-section-title">
            <span className="res-print-sec-num">2</span>
            <span>Reserved Equipment Manifest (Dispatch & Approvals)</span>
          </h2>

          <table className="res-print-table">
            <thead>
              <tr>
                <th style={{ width: "36px", textAlign: "center" }}>#</th>
                <th>Asset Description & Item</th>
                <th style={{ width: "110px" }}>Workspace Area</th>
                <th style={{ width: "65px", textAlign: "center" }}>Req. Qty</th>
                <th style={{ width: "70px", textAlign: "center" }}>Appr. Qty</th>
                <th>Area Clearance & Approver</th>
                <th style={{ width: "95px", textAlign: "center" }}>Item Status</th>
              </tr>
            </thead>
            <tbody>
              {reservation.items.map((item, idx) => {
                const isApproved =
                  item.status === "APPROVED" ||
                  item.approval?.status === "APPROVED";
                return (
                  <tr key={item.id}>
                    <td style={{ textAlign: "center", fontWeight: 600 }}>{idx + 1}</td>
                    <td>
                      <strong className="res-print-asset-name">{item.asset.name}</strong>
                      {item.asset.description && (
                        <div className="res-print-asset-desc">{item.asset.description}</div>
                      )}
                    </td>
                    <td>{item.asset.managementArea.name}</td>
                    <td style={{ textAlign: "center", fontWeight: 600 }}>
                      {item.quantity}
                    </td>
                    <td style={{ textAlign: "center", fontWeight: 700 }}>
                      {isApproved ? item.quantity : "—"}
                    </td>
                    <td>
                      {item.approval ? (
                        <div className="res-print-approval-cell">
                          <span className="res-print-appr-status">
                            {item.approval.status === "APPROVED" ? "Approved by " : "Rejected by "}
                            <strong>{item.approval.approver.name ?? item.approval.approver.email}</strong>
                          </span>
                          {item.approval.decidedAt && (
                            <small className="res-print-appr-time">
                              {formatDate(item.approval.decidedAt, true)}
                            </small>
                          )}
                          {item.approval.comment && (
                            <div className="res-print-appr-comment">
                              Note: {item.approval.comment}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="res-print-pending-text">Pending Area Review</span>
                      )}
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <span className={`res-print-badge res-print-badge--${item.status.toLowerCase()}`}>
                        {item.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3} style={{ textAlign: "right", fontWeight: 700 }}>
                  Manifest Totals ({reservation.items.length} lines):
                </td>
                <td style={{ textAlign: "center", fontWeight: 700 }}>
                  {totalRequestedUnits} units
                </td>
                <td style={{ textAlign: "center", fontWeight: 700 }}>
                  {totalApprovedUnits} units
                </td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
        </section>

        {/* Section: Equipment Return & Inspection Manifest */}
        <section className="res-print-section print-avoid-break">
          <h2 className="res-print-section-title">
            <span className="res-print-sec-num">3</span>
            <span>Equipment Return & Physical Condition Inspection</span>
          </h2>

          {hasReturns ? (
            <div className="res-print-return-stack">
              {reservation.returns.map((ret, rIdx) => {
                const retDate = ret.returnedAt || ret.createdAt;
                const isCompleted =
                  ret.status === "APPROVED" ||
                  ret.status === "COMPLETED" ||
                  ret.approval?.status === "APPROVED";
                return (
                  <div key={ret.id} className="res-print-return-block">
                    <div className="res-print-return-header">
                      <div className="res-print-return-id">
                        <strong>Return Slip #{rIdx + 1}:</strong>{" "}
                        <span className="res-print-mono">RET-{ret.id.slice(0, 8).toUpperCase()}</span>
                      </div>
                      <div className="res-print-return-meta">
                        <span>
                          <strong>Returned By:</strong> {ret.returner?.name ?? ret.returner?.email ?? "Borrower"}
                        </span>
                        <span>
                          <strong>Date:</strong> {formatDate(retDate, true)}
                        </span>
                        <span className={`res-print-status-tag res-print-status-tag--${ret.status.toLowerCase()}`}>
                          {ret.status}
                        </span>
                      </div>
                    </div>

                    <table className="res-print-table res-print-table--return">
                      <thead>
                        <tr>
                          <th style={{ width: "36px", textAlign: "center" }}>#</th>
                          <th>Equipment Line Item</th>
                          <th style={{ width: "110px" }}>Area</th>
                          <th>Serial Units & Condition</th>
                          <th>Condition Notes / Inspector Findings</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ret.items && ret.items.length > 0 ? (
                          ret.items.map((rItem, iIdx) => (
                            <tr key={rItem.id || iIdx}>
                              <td style={{ textAlign: "center", fontWeight: 600 }}>{iIdx + 1}</td>
                              <td>
                                <strong>{rItem.assetName}</strong>
                              </td>
                              <td>{rItem.managementArea?.name ?? "—"}</td>
                              <td>
                                {rItem.units.map((unit) => (
                                  <div key={unit.id} className="res-print-serial-row">
                                    <span className="res-print-mono">{unit.serialNumber}</span>{" "}
                                    <span
                                      style={{
                                        fontWeight: 700,
                                        color:
                                          unit.condition === "BROKEN"
                                            ? "#b93644"
                                            : unit.condition === "LOST"
                                              ? "#b95b0c"
                                              : "#0c6a38",
                                      }}
                                    >
                                      {unit.condition ?? "Pending inspection"}
                                    </span>
                                  </div>
                                ))}
                              </td>
                              <td>{rItem.description || "Item in nominal operational condition."}</td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={5} style={{ textAlign: "center", fontStyle: "italic", padding: "12px" }}>
                              No detailed item rows recorded on this return slip.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>

                    {/* Return Inspection Decision Box */}
                    <div className="res-print-inspection-box">
                      <div className="res-print-inspection-title">
                        <strong>Receiving Officer Clearance & Restock Verification:</strong>
                      </div>
                      <div className="res-print-inspection-grid">
                        <div>
                          <span className="res-print-field-label">Inspector Name:</span>
                          <span className="res-print-field-value">
                            {ret.approval?.approver?.name ??
                              ret.approval?.approver?.email ??
                              "Equipment Room Supervisor"}
                          </span>
                        </div>
                        <div>
                          <span className="res-print-field-label">Inspection Date:</span>
                          <span className="res-print-field-value">
                            {ret.approval?.decidedAt
                              ? formatDate(ret.approval.decidedAt, true)
                              : "Verified at Check-in"}
                          </span>
                        </div>
                        <div>
                          <span className="res-print-field-label">Decision / Verdict:</span>
                          <span className="res-print-field-value res-print-strong">
                            {isCompleted
                              ? "CLEARED & RESTOCKED TO INVENTORY"
                              : ret.approval?.status ?? "PENDING INSPECTION"}
                          </span>
                        </div>
                      </div>
                      {ret.approval?.description && (
                        <div className="res-print-inspection-remarks">
                          <strong>Inspector Remarks:</strong> {ret.approval.description}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Grand Return Totals */}
              <div className="res-print-totals-summary">
                <span>Total Units Returned (Good): <strong>{totalReturnedUnits}</strong></span>
                <span>Total Units Damaged: <strong style={{ color: totalBrokenUnits > 0 ? "#b93644" : "inherit" }}>{totalBrokenUnits}</strong></span>
                <span>Total Units Lost: <strong style={{ color: totalLostUnits > 0 ? "#b95b0c" : "inherit" }}>{totalLostUnits}</strong></span>
              </div>
            </div>
          ) : (
            /* Physical Check-in Sheet when return is not yet completed in system */
            <div className="res-print-return-blank-sheet">
              <p className="res-print-blank-desc">
                <em>
                  Note: Equipment return not yet submitted digitally. Receiving Inspector must complete the physical inspection checklist below upon equipment drop-off:
                </em>
              </p>
              <table className="res-print-table res-print-table--return">
                <thead>
                  <tr>
                    <th style={{ width: "36px", textAlign: "center" }}>#</th>
                    <th>Equipment Item</th>
                    <th style={{ width: "65px", textAlign: "center" }}>Dispatched</th>
                    <th style={{ width: "70px", textAlign: "center" }}>[ ] Good Qty</th>
                    <th style={{ width: "70px", textAlign: "center" }}>[ ] Broken Qty</th>
                    <th style={{ width: "70px", textAlign: "center" }}>[ ] Lost Qty</th>
                    <th>Receiving Notes / Item Condition</th>
                  </tr>
                </thead>
                <tbody>
                  {reservation.items.map((item, idx) => (
                    <tr key={item.id}>
                      <td style={{ textAlign: "center" }}>{idx + 1}</td>
                      <td>
                        <strong>{item.asset.name}</strong> ({item.asset.managementArea.name})
                      </td>
                      <td style={{ textAlign: "center", fontWeight: 600 }}>{item.quantity}</td>
                      <td style={{ textAlign: "center" }}>[ &nbsp; &nbsp; &nbsp; ]</td>
                      <td style={{ textAlign: "center" }}>[ &nbsp; &nbsp; &nbsp; ]</td>
                      <td style={{ textAlign: "center" }}>[ &nbsp; &nbsp; &nbsp; ]</td>
                      <td>
                        <span className="res-print-dotted-line"></span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Section: Official Custody & Authorization Sign-off Grid */}
        <section className="res-print-section res-print-sign-section print-avoid-break">
          <h2 className="res-print-section-title">
            <span className="res-print-sec-num">4</span>
            <span>Chain of Custody & Formal Sign-Off</span>
          </h2>

          <div className="res-print-sign-grid">
            {/* 1. Borrower Sign-off */}
            <div className="res-print-sign-box">
              <div className="res-print-sign-header">
                <strong>1. Requester / Borrower</strong>
                <small>Custody Acceptance</small>
              </div>
              <p className="res-print-sign-statement">
                I hereby acknowledge receipt and custody of listed equipment in sound operating condition and accept full responsibility for its safe return.
              </p>
              <div className="res-print-sign-meta">
                <span>Name: <strong>{reservation.requester.name ?? reservation.requester.email ?? "Borrower"}</strong></span>
                <div className="res-print-sign-line">
                  <span>Signature:</span>
                  <div className="res-print-sign-rule" />
                </div>
                <div className="res-print-date-line">
                  <span>Date:</span>
                  <div className="res-print-date-rule">{formatDate(reservation.startAt)}</div>
                </div>
              </div>
            </div>

            {/* 2. Area Approver Sign-off */}
            <div className="res-print-sign-box">
              <div className="res-print-sign-header">
                <strong>2. Area Custodian / Approver</strong>
                <small>Authorization Clearance</small>
              </div>
              <p className="res-print-sign-statement">
                Equipment reservation and resource allocation authorized in accordance with workspace management policies.
              </p>
              <div className="res-print-sign-meta">
                <span>Name: <strong>{firstApprover?.name ?? firstApprover?.email ?? "Area Manager"}</strong></span>
                <div className="res-print-sign-line">
                  <span>Signature:</span>
                  <div className="res-print-sign-rule" />
                </div>
                <div className="res-print-date-line">
                  <span>Date:</span>
                  <div className="res-print-date-rule">
                    {reservation.items.find((i) => i.approval?.decidedAt)?.approval?.decidedAt
                      ? formatDate(reservation.items.find((i) => i.approval?.decidedAt)!.approval!.decidedAt!, true)
                      : "________________"}
                  </div>
                </div>
              </div>
            </div>

            {/* 3. Receiving & Inspection Officer Sign-off */}
            <div className="res-print-sign-box">
              <div className="res-print-sign-header">
                <strong>3. Return Receiving Inspector</strong>
                <small>Check-in & Restock Sign-Off</small>
              </div>
              <p className="res-print-sign-statement">
                Returned equipment condition verified, damage/loss recorded, and items safely restocked into inventory ledger.
              </p>
              <div className="res-print-sign-meta">
                <span>Name: <strong>{firstReturn?.approval?.approver?.name ?? firstReturn?.approval?.approver?.email ?? "Receiving Inspector"}</strong></span>
                <div className="res-print-sign-line">
                  <span>Signature:</span>
                  <div className="res-print-sign-rule" />
                </div>
                <div className="res-print-date-line">
                  <span>Date:</span>
                  <div className="res-print-date-rule">
                    {firstReturn?.approval?.decidedAt
                      ? formatDate(firstReturn.approval.decidedAt, true)
                      : firstReturn?.returnedAt
                        ? formatDate(firstReturn.returnedAt, true)
                        : "________________"}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Document Footer */}
        <footer className="res-print-footer print-avoid-break">
          <div className="res-print-footer__terms">
            <strong>Advantech Equipment Custody Policy:</strong> All reserved assets remain property of Advantech Corporation. The borrower is liable for damages or loss incurred due to negligence. Discrepancies must be reported to the equipment room supervisor within 24 hours of dispatch.
          </div>
          <div className="res-print-footer__bottom">
            <span>Doc Ref: RES-{reservation.id.slice(0, 8).toUpperCase()} • {reservation.eventName}</span>
            <span>Printed: {nowFormatted} • Official Hard Paper Record</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
