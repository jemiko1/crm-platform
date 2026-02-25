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

@ApiTags('Telephony')
@Controller('v1/telephony/quality')
@UseGuards(JwtAuthGuard)
export class TelephonyQualityController {
  constructor(private readonly qualityService: TelephonyQualityService) {}

  @Get('reviews')
  async getReviews(@Query() query: QueryReviewsDto) {
    return this.qualityService.findAllReviews(query);
  }

  @Get('reviews/:id')
  async getReview(@Param('id') id: string) {
    return this.qualityService.findOneReview(id);
  }

  @Patch('reviews/:id')
  async updateReview(
    @Param('id') id: string,
    @Body() dto: UpdateReviewDto,
    @Req() req: any,
  ) {
    const reviewerUserId = req.user?.userId ?? req.user?.sub;
    return this.qualityService.updateReview(id, dto, reviewerUserId);
  }

  @Get('rubrics')
  async getRubrics() {
    return this.qualityService.findAllRubrics();
  }

  @Post('rubrics')
  async upsertRubric(
    @Body() body: { id?: string; name: string; description?: string; weight: number; maxScore?: number },
  ) {
    return this.qualityService.upsertRubric(body);
  }
}
