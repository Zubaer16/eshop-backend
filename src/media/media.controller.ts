import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger'
import { AccessGuard } from '../auth/access.guard'
import { AdminGuard } from '../auth/admin.guard'
import { AuthenticatedRequest } from '../auth/auth.types'
import { CatalogWriteGuard } from '../catalog/catalog.write.guard'
import { MediaService } from './media.service'
import {
  MediaAssetPublicDto,
  MediaUploadInstructionDto,
  ReplaceProductGalleryDto,
  StartMediaUploadDto,
  MediaLibraryQueryDto,
  MediaLibraryPageDto,
  MediaDeletionScheduledDto,
} from './media.dto'
import { CatalogGalleryImageResponseDto } from '../catalog/catalog.response'

@ApiTags('Media / Admin')
@ApiBearerAuth('access-token')
@Controller('admin')
@UseGuards(AccessGuard, AdminGuard, CatalogWriteGuard)
export class MediaController {
  constructor(private readonly media: MediaService) {}
  @Get('media')
  @ApiOperation({
    summary:
      'Bounded current-namespace media library; ACTIVE by default, exact UUID search; catalog.manage required',
  })
  @ApiOkResponse({ type: MediaLibraryPageDto })
  list(@Query() query: MediaLibraryQueryDto) {
    return this.media.listAssets(query)
  }
  @Post('media/uploads')
  @ApiOperation({
    summary:
      'Create signed direct upload instruction for configured provider (Cloudinary POST or S3/R2 PUT)',
  })
  @ApiCreatedResponse({ type: MediaUploadInstructionDto })
  start(
    @Body() input: StartMediaUploadDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.media.createUpload(input, request.authUser!.id)
  }
  @Post('media/:id/complete')
  @ApiOperation({
    summary:
      'Server verifies provider resource ID, format, dimensions, size and secure delivery URL',
  })
  @ApiCreatedResponse({ type: MediaAssetPublicDto })
  complete(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.media.completeUpload(id, request.authUser!.id)
  }
  @Get('media/:id')
  @ApiOkResponse({ type: MediaAssetPublicDto })
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.media.getAsset(id)
  }
  @Delete('media/:id')
  @ApiOkResponse({ type: MediaDeletionScheduledDto })
  @ApiOperation({
    summary:
      'Schedule deletion of unreferenced media after retention; never delete shared images',
  })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.media.deleteUnattached(id, request.authUser!.id)
  }
  @Get('media-deletion-jobs')
  @ApiOperation({
    summary:
      'List pending/failed/completed deletion jobs without exposing storage secrets',
  })
  jobs() {
    return this.media.deletionJobs()
  }
  @Post('media-deletion-jobs/:id/retry')
  @ApiOperation({
    summary: 'Operator retry for a failed unreferenced media deletion job',
  })
  retry(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.media.retryDeletion(id, request.authUser!.id)
  }
  @Put('products/:id/media')
  @ApiOkResponse({ type: [CatalogGalleryImageResponseDto] })
  @ApiOperation({
    summary:
      'Atomically replace up to six verified images, ordered from cover; queue orphan cleanup',
  })
  gallery(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ReplaceProductGalleryDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.media.replaceGallery(id, body, request.authUser!.id)
  }
}
