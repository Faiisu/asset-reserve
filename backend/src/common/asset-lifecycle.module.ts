import { Global, Module } from "@nestjs/common";
import { AssetLifecycleEvents } from "./asset-lifecycle.events.js";

@Global()
@Module({
  providers: [AssetLifecycleEvents],
  exports: [AssetLifecycleEvents],
})
export class AssetLifecycleModule {}
