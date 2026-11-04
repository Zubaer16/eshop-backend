import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { NotificationOwnerGuard } from '../notifications/notifications.controller'
import {
  PushAdminController,
  PushCampaignsController,
  PushDevicesController,
  PushMarketingGuard,
} from './push.controller'
import { PushDevicesService } from './push-devices.service'
import { PushCampaignsService } from './push-campaigns.service'
import { PushReadService } from './push-read.service'
import { PushQueue } from './push-queue.service'
import { PushDispatcher } from './push-dispatcher.service'
import { PushProvider } from './push.provider'
import { FcmPushProvider } from './fcm-push.provider'
@Module({
  imports: [AuthModule],
  controllers: [
    PushDevicesController,
    PushCampaignsController,
    PushAdminController,
  ],
  providers: [
    PushDevicesService,
    PushCampaignsService,
    PushReadService,
    PushMarketingGuard,
    NotificationOwnerGuard,
    PushQueue,
    PushDispatcher,
    { provide: PushProvider, useClass: FcmPushProvider },
  ],
  exports: [PushQueue, PushDispatcher, PushCampaignsService],
})
export class PushModule {}
