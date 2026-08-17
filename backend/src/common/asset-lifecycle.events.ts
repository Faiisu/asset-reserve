import { Injectable } from "@nestjs/common";
import { EventEmitter } from "node:events";

export type AssetActiveChangedEvent = { assetId: string; isActive: boolean };

/**
 * Minimal in-process pub/sub for asset lifecycle changes. Exists so
 * AssetsService can announce active/inactive transitions without importing
 * RecognitionModule, and RecognitionModule can react without importing
 * AssetsModule for this -- RecognitionModule already imports AssetsModule
 * (to reuse AssetsService.get() for ACL in its own controller), so a direct
 * dependency the other way would make the two modules circular.
 *
 * Global module (see asset-lifecycle.module.ts), so nothing beyond
 * AppModule needs to import it explicitly.
 */
@Injectable()
export class AssetLifecycleEvents {
  private readonly emitter = new EventEmitter();

  onActiveChanged(listener: (event: AssetActiveChangedEvent) => void): void {
    this.emitter.on("activeChanged", listener);
  }

  emitActiveChanged(event: AssetActiveChangedEvent): void {
    this.emitter.emit("activeChanged", event);
  }
}
