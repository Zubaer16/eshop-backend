import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common'
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { AccessGuard } from '../auth/access.guard'
import { AdminGuard } from '../auth/admin.guard'
import type { AuthenticatedRequest } from '../auth/auth.types'
import {
  AdminFeaturedCollectionDto,
  AdminStoreBannerDto,
  ArchivedMerchandisingDto,
  BannerPageResponseDto,
  CollectionPageResponseDto,
  MerchandisingPageQueryDto,
  MerchandisingRevisionQueryDto,
  MerchandisingSlugParamDto,
  PublicFeaturedCollectionDto,
  PublicHomepageDto,
  SaveFeaturedCollectionDto,
  SaveStoreBannerDto,
} from './merchandising.dto'
import { MerchandisingManageGuard } from './merchandising.guard'
import { MerchandisingService } from './merchandising.service'

@ApiTags('Merchandising / Admin')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Staff JWT required' })
@ApiForbiddenResponse({
  description: 'OWNER or current marketing.manage required',
})
@ApiBadRequestResponse({
  description: 'Invalid fields, reference, publication window or CTA',
})
@ApiConflictResponse({
  description: 'Stale revision, duplicate slug/title or unavailable reference',
})
@ApiNotFoundResponse({ description: 'Content not found' })
@Controller('admin/store')
@UseGuards(AccessGuard, AdminGuard, MerchandisingManageGuard)
export class MerchandisingAdminController {
  constructor(private readonly service: MerchandisingService) {}
  @Get('banners')
  @ApiOkResponse({ type: BannerPageResponseDto })
  banners(@Query() query: MerchandisingPageQueryDto) {
    return this.service.listBanners(query)
  }
  @Get('banners/:id')
  @ApiOkResponse({ type: AdminStoreBannerDto })
  banner(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getBanner(id)
  }
  @Post('banners')
  @ApiOperation({
    summary:
      'Create draft/published banner with safe CTA and optional verified image',
  })
  @ApiCreatedResponse({ type: AdminStoreBannerDto })
  createBanner(
    @Body() dto: SaveStoreBannerDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.saveBanner(null, dto, req.authUser!.id)
  }
  @Put('banners/:id')
  @ApiOperation({
    summary:
      'Revision-checked banner replacement; scheduled publication uses DB clock',
  })
  @ApiOkResponse({ type: AdminStoreBannerDto })
  updateBanner(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveStoreBannerDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.saveBanner(id, dto, req.authUser!.id)
  }
  @Delete('banners/:id')
  @ApiOperation({
    summary:
      'Archive banner and detach image atomically; shared assets retain existing lifecycle protection',
  })
  @ApiOkResponse({ type: ArchivedMerchandisingDto })
  archiveBanner(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: MerchandisingRevisionQueryDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.archive(id, query.expectedRevision, req.authUser!.id)
  }
  @Get('collections')
  @ApiOkResponse({ type: CollectionPageResponseDto })
  collections(@Query() query: MerchandisingPageQueryDto) {
    return this.service.listCollections(query)
  }
  @Get('collections/:id')
  @ApiOkResponse({ type: AdminFeaturedCollectionDto })
  collection(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getCollection(id)
  }
  @Post('collections')
  @ApiOperation({
    summary:
      'Create ordered curated collection; published products must be ACTIVE',
  })
  @ApiCreatedResponse({ type: AdminFeaturedCollectionDto })
  createCollection(
    @Body() dto: SaveFeaturedCollectionDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.saveCollection(null, dto, req.authUser!.id)
  }
  @Put('collections/:id')
  @ApiOkResponse({ type: AdminFeaturedCollectionDto })
  updateCollection(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveFeaturedCollectionDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.saveCollection(id, dto, req.authUser!.id)
  }
  @Delete('collections/:id')
  @ApiOperation({
    summary:
      'Archive collection; preserve curated membership for editing/history',
  })
  @ApiOkResponse({ type: ArchivedMerchandisingDto })
  archiveCollection(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: MerchandisingRevisionQueryDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.archive(
      id,
      query.expectedRevision,
      req.authUser!.id,
      true,
    )
  }
}

@ApiTags('Merchandising / Public')
@Controller('store')
@ApiServiceUnavailableResponse({
  description: 'Storage unavailable; no mock content fallback',
})
export class MerchandisingPublicController {
  constructor(private readonly service: MerchandisingService) {}
  @Get('homepage')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary:
      'Published in-window banners and curated ACTIVE product cards; bounded homepage sections',
  })
  @ApiOkResponse({ type: PublicHomepageDto })
  homepage() {
    return this.service.homepage()
  }
  @Get('collections/:slug')
  @Header('Cache-Control', 'no-store')
  @ApiParam({ name: 'slug', schema: { type: 'string', maxLength: 120 } })
  @ApiOperation({
    summary:
      'Published collection detail with max 50 ACTIVE products in curated order',
  })
  @ApiOkResponse({ type: PublicFeaturedCollectionDto })
  @ApiBadRequestResponse({ description: 'Invalid slug' })
  @ApiNotFoundResponse({
    description: 'Collection unavailable or no visible products',
  })
  collection(@Param() params: MerchandisingSlugParamDto) {
    return this.service.collectionBySlug(params.slug)
  }
}
