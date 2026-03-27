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
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { TelephonyQualityService } from '../services/telephony-quality.service';
import { QueryReviewsDto, UpdateReviewDto } from '../dto/query-reviews.dto';
import { Doc } from '../../common/openapi/doc-endpoint.decorator';

@ApiTags('Telephony')
@Controller('v1/telephony/quality')
@UseGuards(JwtAuthGuard)
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
  @Doc({
    summary: 'Update quality review (human feedback)',
    ok: 'Updated review',
    notFound: true,
    bodyType: UpdateReviewDto,
    params: [{ name: 'id', description: 'Review UUID' }],
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
  @Doc({
    summary: 'Create or update rubric',
    ok: 'Upserted rubric',
    status: 201,
  })
  async upsertRubric(
    @Body() body: { id?: string; name: string; description?: string; weight: number; maxScore?: number },
  ) {
    return this.qualityService.upsertRubric(body);
  }
}
