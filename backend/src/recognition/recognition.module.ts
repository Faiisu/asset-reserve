import { Module } from "@nestjs/common";
import { AssetsModule } from "../assets/assets.module.js";
import { RecognitionController } from "./recognition.controller.js";
import { RecognitionLifecycleListener } from "./recognition-lifecycle.listener.js";
import { RecognitionService } from "./recognition.service.js";

@Module({
  imports: [AssetsModule],
  controllers: [RecognitionController],
  providers: [RecognitionService, RecognitionLifecycleListener],
})
export class RecognitionModule {}
