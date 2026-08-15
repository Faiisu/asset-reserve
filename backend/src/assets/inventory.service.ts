import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { Prisma } from "../../generated/prisma/client.js";
import type { AuthenticatedActor } from "../auth/auth.types.js";
import { ApiException } from "../common/api-exception.js";
import { PrismaService } from "../database/prisma.service.js";
import { assertAreaPermission } from "./asset-access.js";
import type { InventoryBatchDto } from "./assets.dto.js";

type InventoryOperation = "ADD" | "REMOVE";

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  add(actor: AuthenticatedActor, input: InventoryBatchDto) {
    return this.adjust(actor, input, "ADD");
  }

  remove(actor: AuthenticatedActor, input: InventoryBatchDto) {
    return this.adjust(actor, input, "REMOVE");
  }

  private async adjust(
    actor: AuthenticatedActor,
    input: InventoryBatchDto,
    operation: InventoryOperation,
  ) {
    const ids = input.items.map((item) => item.assetId);
    if (new Set(ids).size !== ids.length) {
      throw new ApiException(
        422,
        "VALIDATION_ERROR",
        "A batch cannot contain duplicate assets.",
        { items: "Combine duplicate asset entries into one quantity." },
      );
    }

    const assets = await this.prisma.asset.findMany({
      where: { id: { in: ids } },
      select: { id: true, managementAreaId: true },
    });
    if (assets.length !== ids.length) {
      throw new ApiException(
        404,
        "ASSET_NOT_FOUND",
        "One or more assets were not found.",
      );
    }
    for (const asset of assets) {
      assertAreaPermission(actor, "asset:update", asset.managementAreaId);
    }

    const lines = [...input.items].sort((a, b) =>
      a.assetId.localeCompare(b.assetId),
    );
    const result = await this.runSerializable(async (tx) => {
      const activeActor = await tx.user.findFirst({
        where: { id: actor.user.id, isActive: true },
        select: { id: true },
      });
      if (!activeActor) {
        throw new ApiException(
          401,
          "AUTHENTICATION_REQUIRED",
          "The account is no longer active.",
        );
      }

      const batchId = randomUUID();
      await tx.assetTransactionBatch.create({
        data: {
          id: batchId,
          description: input.description ?? null,
          performedBy: actor.user.id,
        },
      });

      for (const line of lines) {
        const result =
          operation === "ADD"
            ? await tx.asset.updateMany({
                where: { id: line.assetId },
                data: {
                  totalQuantity: { increment: line.quantity },
                  updatedAt: new Date(),
                },
              })
            : await tx.asset.updateMany({
                where: {
                  id: line.assetId,
                  totalQuantity: { gte: line.quantity },
                },
                data: {
                  totalQuantity: { decrement: line.quantity },
                  updatedAt: new Date(),
                },
              });
        if (!result.count) {
          throw new ApiException(
            409,
            "INSUFFICIENT_QUANTITY",
            "Removing this batch would make an asset quantity negative.",
            {
              [`items.${input.items.findIndex((item) => item.assetId === line.assetId)}.quantity`]:
                "The removal exceeds the current total quantity.",
            },
          );
        }
      }

      await tx.assetTransaction.createMany({
        data: lines.map((line) => ({
          id: randomUUID(),
          batchId,
          assetId: line.assetId,
          transactionType: operation,
          quantityDelta: operation === "ADD" ? line.quantity : -line.quantity,
          reason: line.reason ?? null,
        })),
      });
      return tx.assetTransactionBatch.findUniqueOrThrow({
        where: { id: batchId },
        include: {
          performer: { include: { profile: true } },
          transactions: {
            include: { asset: true },
            orderBy: { assetId: "asc" },
          },
        },
      });
    });

    return {
      id: result.id,
      operation,
      description: result.description,
      performedBy: {
        id: result.performer.id,
        email: result.performer.email,
        name: result.performer.profile?.name ?? null,
      },
      items: result.transactions.map((transaction) => ({
        transactionId: transaction.id,
        assetId: transaction.assetId,
        assetName: transaction.asset.name,
        quantityDelta: transaction.quantityDelta,
        totalQuantity: transaction.asset.totalQuantity,
        reason: transaction.reason,
      })),
      createdAt: result.createdAt.toISOString(),
    };
  }

  private async runSerializable<T>(
    work: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(work, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        if (this.prismaCode(error) !== "P2034" || attempt === 3) throw error;
        await new Promise((resolve) =>
          setTimeout(resolve, 10 * 2 ** (attempt - 1) + Math.random() * 10),
        );
      }
    }
    throw new Error("Unreachable inventory transaction state.");
  }

  private prismaCode(error: unknown): string | undefined {
    if (typeof error !== "object" || error === null || !("code" in error)) {
      return undefined;
    }
    return typeof error.code === "string" ? error.code : undefined;
  }
}
