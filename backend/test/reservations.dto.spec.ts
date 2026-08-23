import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { describe, expect, it } from "vitest";
import {
  ConfirmDeliveryDto,
  CreateReservationDto,
  ReservationItemInputDto,
} from "../src/reservations/reservations.dto.js";

describe("reservation API validation", () => {
  it("accepts at most 200 units per reservation item", async () => {
    const accepted = plainToInstance(ReservationItemInputDto, {
      assetId: "00000000-0000-4000-8000-000000000101",
      quantity: 200,
    });
    const rejected = plainToInstance(ReservationItemInputDto, {
      assetId: "00000000-0000-4000-8000-000000000101",
      quantity: 201,
    });

    expect(await validate(accepted)).toEqual([]);
    expect(
      (await validate(rejected)).some((error) => error.property === "quantity"),
    ).toBe(true);
  });

  it("requires at least one asset line on a reservation (§7.1)", async () => {
    const base = {
      eventName: "Quarterly town hall",
      startAt: "2026-09-01T09:00:00.000Z",
      endAt: "2026-09-01T11:00:00.000Z",
    };
    const withItem = plainToInstance(CreateReservationDto, {
      ...base,
      items: [{ assetId: "00000000-0000-4000-8000-000000000101", quantity: 1 }],
    });
    const empty = plainToInstance(CreateReservationDto, { ...base, items: [] });
    const omitted = plainToInstance(CreateReservationDto, base);

    expect(await validate(withItem)).toEqual([]);
    for (const invalid of [empty, omitted]) {
      expect(
        (await validate(invalid)).some((error) => error.property === "items"),
      ).toBe(true);
    }
  });

  it("rejects an empty handover or cancellation list, which must be omitted instead", async () => {
    // Both lists are minItems: 1. A client with nothing to cancel has to
    // leave the key out -- sending [] is a 422, which is easy to get wrong
    // when the payload is built by mapping over every item.
    const itemId = "00000000-0000-4000-8000-000000000101";
    const unitId = "00000000-0000-4000-8000-000000000811";
    const build = (item: Record<string, unknown>) =>
      plainToInstance(ConfirmDeliveryDto, { items: [item] });

    const handoverOnly = build({
      reservationItemId: itemId,
      reservationItemUnitIds: [unitId],
    });
    const cancelOnly = build({
      reservationItemId: itemId,
      cancelledReservationItemUnitIds: [unitId],
    });
    expect(await validate(handoverOnly)).toEqual([]);
    expect(await validate(cancelOnly)).toEqual([]);

    for (const key of [
      "reservationItemUnitIds",
      "cancelledReservationItemUnitIds",
    ]) {
      const withEmptyList = build({
        reservationItemId: itemId,
        reservationItemUnitIds: [unitId],
        [key]: [],
      });
      const errors = await validate(withEmptyList, {
        validationError: { target: false },
      });
      expect(JSON.stringify(errors)).toContain("arrayMinSize");
    }
  });
});
