import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { describe, expect, it } from "vitest";
import { ReservationItemInputDto } from "../src/reservations/reservations.dto.js";

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
});
