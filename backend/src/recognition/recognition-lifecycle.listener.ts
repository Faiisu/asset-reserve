import { Injectable, type OnModuleInit } from "@nestjs/common";
import { AssetLifecycleEvents } from "../common/asset-lifecycle.events.js";
import { RecognitionService } from "./recognition.service.js";

/**
 * Keeps the recognition service's "disabled" flag in sync with the main
 * app's asset active/inactive status. Reference photos and embeddings are
 * never deleted on deactivate -- just hidden from matching -- so
 * reactivating an asset makes it recognizable again instantly, with no
 * re-upload. Best-effort throughout; see RecognitionService.setDisabled.
 */
@Injectable()
export class RecognitionLifecycleListener implements OnModuleInit {
  constructor(
    private readonly events: AssetLifecycleEvents,
    private readonly recognition: RecognitionService,
  ) {}

  onModuleInit(): void {
    this.events.onActiveChanged(({ assetId, isActive }) => {
      void this.recognition.setDisabled(assetId, !isActive);
    });
  }
}
