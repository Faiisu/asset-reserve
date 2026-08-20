import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { generateStepLogs, ReservationHorizontalTracker } from "./ReservationHorizontalTracker";
import { buildReservationSteps, ReservationTrackingTimeline } from "./ReservationTracking";
import type { ReservationDetail } from "../types";

const baseReservation: ReservationDetail = {
  id: "00000000-0000-4000-8000-000000000101",
  eventName: "Quarterly Town Hall Stream",
  description: "Stage video shoot",
  startAt: "2026-09-01T09:00:00.000Z",
  endAt: "2026-09-01T11:00:00.000Z",
  status: "APPROVED",
  requester: {
    id: "00000000-0000-4000-8000-000000000001",
    email: "owner@example.com",
    name: "Event Owner",
    profilePictureUrl: null,
  },
  participants: [],
  items: [
    {
      id: "item-1",
      quantity: 2,
      status: "APPROVED",
      asset: {
        id: "asset-1",
        name: "Stage Camera 4K",
        description: "Studio camera",
        pictureUrl: null,
        isActive: true,
        managementArea: {
          id: "area-1",
          name: "Marketing",
        },
      },
      approval: {
        id: "app-1",
        status: "APPROVED",
        comment: "Approved for town hall",
        decidedAt: "2026-08-16T10:00:00.000Z",
        approver: {
          id: "mgr-1",
          name: "Marketing Manager",
          email: "mk@example.com",
          profilePictureUrl: null,
        },
      },
      availability: {
        assetId: "asset-1",
        totalQuantity: 5,
        approvedQuantity: 2,
        pendingQuantity: 0,
        availableQuantity: 3,
        pendingReservationCount: 0,
      },
      warnings: [],
      capabilities: {
        canApprove: false,
        canReject: false,
        canConfirmDelivery: true,
        canReturn: false,
      },
      returnSummary: {
        returnedQuantity: 0,
        brokenQuantity: 0,
        lostQuantity: 0,
        pendingReturnQuantity: 0,
        remainingReturnQuantity: 2,
      },
    },
  ],
  returns: [],
  capabilities: {
    canSubmit: false,
    canConfirmDelivery: true,
    canReturn: false,
    canCancel: true,
  },
  createdAt: "2026-08-15T00:00:00.000Z",
  updatedAt: "2026-08-16T10:00:00.000Z",
};

describe("ReservationHorizontalTracker & generateStepLogs", () => {
  it("generates exactly 5 steps with 2 split return phases (Pending Return & Return Approve)", () => {
    const steps = generateStepLogs(baseReservation);
    expect(steps).toHaveLength(5);
    expect(steps.map((s) => s.stepKey)).toEqual([
      "draft",
      "approval",
      "delivery",
      "pending_return",
      "return_approve",
    ]);
    expect(steps.map((s) => s.shortLabel)).toEqual([
      "Drafted",
      "Approved",
      "Handover",
      "Pending Return",
      "Return Approval",
    ]);
  });

  it("sets step 4 'Pending Return' as current when status is DELIVERY_CONFIRMED", () => {
    const deliveryReservation: ReservationDetail = {
      ...baseReservation,
      status: "DELIVERY_CONFIRMED",
    };
    const steps = generateStepLogs(deliveryReservation);
    expect(steps).toHaveLength(5);
    expect(steps[2].status).toBe("completed"); // Handover step
    expect(steps[3].stepKey).toBe("pending_return");
    expect(steps[3].shortLabel).toBe("Pending Return");
    expect(steps[3].status).toBe("current");
    expect(steps[4].stepKey).toBe("return_approve");
    expect(steps[4].status).toBe("upcoming");
  });

  it("sets step 4 as completed and step 5 'Return Approval' as current when return is submitted", () => {
    const returnPendingReservation: ReservationDetail = {
      ...baseReservation,
      status: "RETURN_PENDING",
      returns: [
        {
          id: "ret-1",
          reservationId: baseReservation.id,
          status: "PENDING",
          returnedAt: "2026-09-02T10:00:00.000Z",
          returnedBy: baseReservation.requester,
          createdAt: "2026-09-02T10:00:00.000Z",
          updatedAt: "2026-09-02T10:00:00.000Z",
          capabilities: { canApprove: true, canReject: true },
          approval: {
            id: "ret-app-1",
            status: "PENDING",
            decidedAt: null,
            description: null,
            approver: baseReservation.requester,
          },
          items: [],
        },
      ],
    };
    const steps = generateStepLogs(returnPendingReservation);
    expect(steps).toHaveLength(5);
    expect(steps[3].status).toBe("completed"); // Pending Return step completed upon submission
    expect(steps[4].stepKey).toBe("return_approve");
    expect(steps[4].status).toBe("current"); // Return Approval step is current
    expect(steps[4].shortLabel).toBe("Return Approval");
  });

  it("sets both step 4 and step 5 as completed when status is COMPLETED or RETURN_CONFIRMED", () => {
    const completedReservation: ReservationDetail = {
      ...baseReservation,
      status: "COMPLETED",
      returns: [
        {
          id: "ret-1",
          reservationId: baseReservation.id,
          status: "COMPLETED",
          returnedAt: "2026-09-02T10:00:00.000Z",
          returnedBy: baseReservation.requester,
          createdAt: "2026-09-02T10:00:00.000Z",
          updatedAt: "2026-09-02T11:00:00.000Z",
          capabilities: {
            canApprove: false,
            canReject: false,
          },
          approval: {
            id: "ret-app-1",
            status: "APPROVED",
            decidedAt: "2026-09-02T11:00:00.000Z",
            description: "All assets intact",
            approver: {
              id: "mgr-1",
              name: "Manager",
              email: "mgr@example.com",
              profilePictureUrl: null,
            },
          },
          items: [],
        },
      ],
    };
    const steps = generateStepLogs(completedReservation);
    expect(steps).toHaveLength(5);
    expect(steps[3].status).toBe("completed");
    expect(steps[4].shortLabel).toBe("Return Approved");
    expect(steps[4].status).toBe("completed");
    expect(steps[4].title).toBe("5. Return Approved & Restocked");
  });

  it("renders tracker UI with 5 steps and allows inspecting audit logs", () => {
    render(<ReservationHorizontalTracker reservation={baseReservation} />);

    expect(screen.getByText("Reservation Status Track")).toBeInTheDocument();
    expect(screen.getByLabelText("Inspect step Drafted")).toBeInTheDocument();
    expect(screen.getByLabelText("Inspect step Approved")).toBeInTheDocument();
    expect(screen.getByLabelText("Inspect step Handover")).toBeInTheDocument();
    expect(screen.getByLabelText("Inspect step Pending Return")).toBeInTheDocument();
    expect(screen.getByLabelText("Inspect step Return Approval")).toBeInTheDocument();

    // Click Pending Return step
    fireEvent.click(screen.getByLabelText("Inspect step Pending Return"));
    expect(screen.getByText("Step Metadata & Timeline")).toBeInTheDocument();
    expect(screen.getByText("4. Pending Return")).toBeInTheDocument();
  });
});

describe("ReservationTracking (buildReservationSteps & ReservationTrackingTimeline)", () => {
  it("builds 5 steps with Pending Return and Return Approval phases", () => {
    const deliveryReservation: ReservationDetail = {
      ...baseReservation,
      status: "DELIVERY_CONFIRMED",
    };
    const steps = buildReservationSteps(deliveryReservation);
    expect(steps).toHaveLength(5);
    expect(steps.map((s) => s.name)).toEqual([
      "Reservation Drafted",
      "Area Approval",
      "Equipment Handover",
      "Pending Return",
      "Return Approval & Inspection",
    ]);
    expect(steps[3].status).toBe("current");
    expect(steps[4].status).toBe("upcoming");
  });

  it("renders timeline with 5 steps", () => {
    render(<ReservationTrackingTimeline reservation={baseReservation} />);
    expect(screen.getByText("Reservation Lifecycle Tracking")).toBeInTheDocument();
    expect(screen.getByText("Pending Return")).toBeInTheDocument();
    expect(screen.getByText("Return Approval & Inspection")).toBeInTheDocument();
  });
});
