import { Global, Module } from "@nestjs/common";
import { ReservationLifecycleEvents } from "./reservation-lifecycle.events.js";

@Global()
@Module({
  providers: [ReservationLifecycleEvents],
  exports: [ReservationLifecycleEvents],
})
export class ReservationLifecycleModule {}
