import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { describe, expect, it } from "vitest";
import { CreateAssetDto, InventoryBatchDto } from "../src/assets/assets.dto.js";

describe("asset API validation", () => {
  it("accepts a complete asset detail with a picture URL", async () => {
    const input = plainToInstance(CreateAssetDto, {
      name: "  Projector  ",
      managementAreaId: "00000000-0000-4000-8000-000000000101",
      description: "Meeting room projector",
      pictureUrl: "https://assets.example.test/projector.jpg",
      totalQuantity: 4,
    });
    expect(await validate(input)).toEqual([]);
    expect(input.name).toBe("Projector");
  });

  it("rejects zero or negative inventory adjustment quantities", async () => {
    const input = plainToInstance(InventoryBatchDto, {
      items: [
        {
          assetId: "00000000-0000-4000-8000-000000000101",
          quantity: 0,
        },
      ],
    });
    const errors = await validate(input);
    expect(errors).not.toEqual([]);
  });
});
