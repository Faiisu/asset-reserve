import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { describe, expect, it } from "vitest";
import {
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
      items: [
        { assetId: "00000000-0000-4000-8000-000000000101", quantity: 1 },
      ],
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
});
