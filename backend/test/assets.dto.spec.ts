import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { describe, expect, it } from "vitest";
import {
  CreateAssetDto,
  RegisterAssetUnitsDto,
} from "../src/assets/assets.dto.js";

describe("asset API validation", () => {
  it("accepts a complete asset detail with a picture URL", async () => {
    const input = plainToInstance(CreateAssetDto, {
      name: "  Projector  ",
      managementAreaId: "00000000-0000-4000-8000-000000000101",
      description: "Meeting room projector",
      pictureUrl: "https://assets.example.test/projector.jpg",
    });
    expect(await validate(input)).toEqual([]);
    expect(input.name).toBe("Projector");
  });

  it("accepts an asset detail with an uploaded relative picture path", async () => {
    const input = plainToInstance(CreateAssetDto, {
      name: "Projector",
      managementAreaId: "00000000-0000-4000-8000-000000000101",
      pictureUrl: "/uploads/assets/1739624832-sample.png",
    });
    expect(await validate(input)).toEqual([]);
  });

  it("rejects an invalid pictureUrl that is neither a URL nor a path", async () => {
    const input = plainToInstance(CreateAssetDto, {
      name: "Projector",
      managementAreaId: "00000000-0000-4000-8000-000000000101",
      pictureUrl: "not a url or path",
    });
    const errors = await validate(input);
    expect(errors.some((e) => e.property === "pictureUrl")).toBe(true);
  });

  it("rejects an empty serial number list when registering asset units", async () => {
    const input = plainToInstance(RegisterAssetUnitsDto, {
      serialNumbers: [],
    });
    const errors = await validate(input);
    expect(errors).not.toEqual([]);
  });

  it("rejects duplicate serial numbers in one registration batch", async () => {
    const input = plainToInstance(RegisterAssetUnitsDto, {
      serialNumbers: ["SN-001", "SN-001"],
    });
    const errors = await validate(input);
    expect(errors.some((e) => e.property === "serialNumbers")).toBe(true);
  });
});
