import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PositionPermissionGuard } from '../../common/guards/position-permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { TelephonyQualityService } from '../services/telephony-quality.service';
import { QueryReviewsDto, UpdateReviewDto } from '../dto/query-reviews.dto';
import { Doc } from '../../common/openapi/doc-endpoint.decorator';

class UpsertRubricDto {
  @IsString() @IsOptional() id?: string;
  @IsString() name!: string;
  @IsString() @IsOptional() description?: string;
  @IsNumber() @Min(0) weight!: number;
  @IsNumber() @IsOptional() maxScore?: number;
}

@ApiTags('Telephony')
@Controller('v1/telephony/quality')
@UseGuards(JwtAuthGuard, PositionPermissionGuard)
@RequirePermission('call_center.menu')
export class TelephonyQualityController {
  constructor(private readonly qualityService: TelephonyQualityService) {}

  @Get('reviews')
  @Doc({ summary: 'List AI call quality reviews', ok: 'Paged reviews' })
  async getReviews(@Query() query: QueryReviewsDto) {
    return this.qualityService.findAllReviews(query);
  }

  @Get('reviews/:id')
  @Doc({
    summary: 'Quality review by ID',
    ok: 'Review detail',
    notFound: true,
    params: [{ name: 'id', description: 'Review UUID' }],
  })
  async getReview(@Param('id') id: string) {
    return this.qualityService.findOneReview(id);
  }

  @Patch('reviews/:id')
  @RequirePermission('telephony.manage')
  @Doc({
    summary: 'Update quality review (human feedback)',
    ok: 'Updated review',
    notFound: true,
    bodyType: UpdateReviewDto,
    params: [{ name: 'id', description: 'Review UUID' }],
    permission: true,
  })
  async updateReview(
    @Param('id') id: string,
    @Body() dto: UpdateReviewDto,
    @Req() req: any,
  ) {
    const reviewerUserId = req.user?.userId ?? req.user?.sub;
    return this.qualityService.updateReview(id, dto, reviewerUserId);
  }

  @Get('rubrics')
  @Doc({ summary: 'Quality scoring rubrics', ok: 'Rubric definitions' })
  async getRubrics() {
    return this.qualityService.findAllRubrics();
  }

  @Post('rubrics')
  @RequirePermission('telephony.manage')
  @Doc({
    summary: 'Create or update rubric',
    ok: 'Upserted rubric',
    status: 201,
    bodyType: UpsertRubricDto,
    permission: true,
  })
  async upsertRubric(
    @Body() body: UpsertRubricDto,
  ) {
    return this.qualityService.upsertRubric(body);
  }
}
