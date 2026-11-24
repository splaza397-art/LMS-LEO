import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, Query, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ApiOptionalQueries, PAGE_QUERIES } from '../../common/openapi';
import type { Request, Response } from 'express';
import { AuthUser, CurrentUser, Public, RequirePermission } from '../auth/auth.decorators';
import { ContentDto } from './content.dto';
import { ContentService } from './content.service';

@ApiTags('contenidos')
@ApiBearerAuth()
@Controller({ version: '1' })
export class ContentController {
  constructor(private readonly content: ContentService) {}

  @Public()
  @Get('content/:type')
  published(@Param('type') type: string) {
    return this.content.publishedByType(type);
  }

  @Public()
  @Get('content/:type/:slug')
  item(@Param('type') type: string, @Param('slug') slug: string) {
    return this.content.publishedItem(type, slug);
  }

  @Public()
  @Get('media/:id')
  async media(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const file = await this.content.media(id);
    res.set({ 'content-type': file.mime, 'cache-control': 'public, max-age=86400', 'x-content-type-options': 'nosniff' }).send(file.data);
  }

  @Public()
  @Get('sitemap-data')
  sitemapData() {
    return this.content.sitemapData();
  }

  @Public()
  @Get('redirects')
  redirects() {
    return this.content.redirects();
  }

  @Post('admin/media')
  @RequirePermission('content:manage')
  upload(@CurrentUser() actor: AuthUser, @Req() req: Request) {
    return this.content.upload(actor, req.body as unknown);
  }

  @Get('admin/content')
  @ApiOptionalQueries('type', 'status', 'q', ...PAGE_QUERIES)
  @RequirePermission('content:manage')
  list(
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('sort') sort?: string,
    @Query('order') order?: string,
  ) {
    return this.content.adminList({ type, status, q, page, pageSize, sort, order });
  }

  @Post('admin/content')
  @RequirePermission('content:manage')
  create(@CurrentUser() actor: AuthUser, @Body() dto: ContentDto) {
    return this.content.create(actor, dto);
  }

  @Put('admin/content/:id')
  @RequirePermission('content:manage')
  update(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ContentDto) {
    return this.content.update(actor, id, dto);
  }

  @Delete('admin/content/:id')
  @RequirePermission('content:manage')
  remove(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.content.remove(actor, id);
  }
}
