import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTooManyRequestsResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger'
import { AuthService } from './auth.service'
import { AccessGuard } from './access.guard'
import { AdminGuard } from './admin.guard'
import { AuthenticatedRequest } from './auth.types'
import { CredentialsDto, SafeUserDto, TokenPairDto } from './auth.dto'

@ApiTags('Authentication / Admin')
@ApiTooManyRequestsResponse({
  description: 'Staff login rate limited; Retry-After seconds header',
})
@ApiServiceUnavailableResponse({
  description: 'Credential throttle database unavailable (fail closed)',
})
@Controller('admin/auth')
export class AdminAuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Login existing staff; no public admin registration',
  })
  @ApiOkResponse({ type: TokenPairDto })
  login(@Body() dto: CredentialsDto): Promise<TokenPairDto> {
    return this.auth.login(dto, true)
  }

  @Get('me')
  @UseGuards(AccessGuard, AdminGuard)
  @ApiBearerAuth('access-token')
  @ApiOkResponse({ type: SafeUserDto })
  me(@Req() req: AuthenticatedRequest): SafeUserDto {
    return req.authUser!
  }
}
