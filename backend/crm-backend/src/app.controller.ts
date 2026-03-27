import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Doc } from './common/openapi/doc-endpoint.decorator';
import { AppService } from './app.service';

@ApiTags('App')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @Doc({
    summary: 'Root health / hello',
    ok: 'Plain-text greeting from the API root',
    noAuth: true,
  })
  getHello(): string {
    return this.appService.getHello();
  }
}
