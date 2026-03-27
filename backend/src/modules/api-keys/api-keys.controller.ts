import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common'
import { AuthGuard } from '../../shared/auth.guard'
import type { CreateApiKeyDto } from './dto/create-api-key.dto'
import type { ApiKeysService } from './api-keys.service'

@Controller('api-keys')
@UseGuards(AuthGuard)
export class ApiKeysController {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  @Get('my')
  async findMyKeys(@Req() req: any) {
    const keys = await this.apiKeysService.findByUser(req.user.userId);
    return keys;
  }

  @Post('organization/:orgId')
  async create(
    @Param('orgId') orgId: string,
    @Body() dto: CreateApiKeyDto,
    @Req() req: any
  ) {
    const key = await this.apiKeysService.create(orgId, req.user.userId, dto)
    return { apiKey: key }
  }

  @Delete(':keyId')
  async delete(@Param('keyId') keyId: string) {
    await this.apiKeysService.delete(keyId);
    return { success: true };
  }
}
