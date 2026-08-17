import { Module } from "@nestjs/common";
import { AssetsModule } from "../assets/assets.module.js";
import { RecognitionController } from "./recognition.controller.js";
import { RecognitionService } from "./recognition.service.js";

@Module({
  imports: [AssetsModule],
  controllers: [RecognitionController],
  providers: [RecognitionService],
})
export class RecognitionModule {}
