import { Body, Controller, Delete, Get, Param, ParseIntPipe, ParseUUIDPipe, Post, Put, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AuthUser, CurrentUser, Public, RequirePermission } from '../auth/auth.decorators';
import { CohortDto, ProgramCourseDto, ProgramDto, TeacherDto } from './programs.dto';
import { ProgramsService } from './programs.service';

@ApiTags('programas')
@ApiBearerAuth()
@Controller({ version: '1' })
export class ProgramsController {
  constructor(private readonly programs: ProgramsService) {}

  @Public()
  @Get('programs')
  published() {
    return this.programs.published();
  }

  @Public()
  @Get('programs/:slug')
  program(@Param('slug') slug: string) {
    return this.programs.publishedBySlug(slug);
  }

  @Get('admin/programs')
  @RequirePermission('programs:manage')
  list(@CurrentUser() actor: AuthUser) {
    return this.programs.adminList(actor);
  }

  @Post('admin/programs')
  @RequirePermission('programs:manage')
  create(@CurrentUser() actor: AuthUser, @Body() dto: ProgramDto) {
    return this.programs.create(actor, dto);
  }

  @Put('admin/programs/:id')
  @RequirePermission('programs:manage')
  update(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ProgramDto) {
    return this.programs.update(actor, id, dto);
  }

  @Post('admin/programs/:id/cohorts')
  @RequirePermission('programs:manage')
  createCohort(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CohortDto) {
    return this.programs.createCohort(actor, id, dto);
  }

  @Post('admin/programs/:id/courses')
  @RequirePermission('programs:manage')
  linkCourse(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ProgramCourseDto) {
    return this.programs.linkCourse(actor, id, dto.moodleCourseId);
  }

  @Delete('admin/programs/:id/courses/:courseId')
  @RequirePermission('programs:manage')
  unlinkCourse(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Param('courseId', ParseIntPipe) courseId: number) {
    return this.programs.unlinkCourse(actor, id, courseId);
  }

  @Get('admin/programs/:id/teachers')
  @RequirePermission('programs:manage')
  teachers(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.programs.teachers(actor, id);
  }

  @Put('admin/programs/:id/teachers')
  @RequirePermission('programs:manage')
  setTeacher(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: TeacherDto, @Req() req: Request) {
    return this.programs.setTeacher(actor, id, dto.courseId, dto.userId, dto.active, req.ip);
  }

  @Get('admin/teachers')
  @RequirePermission('programs:manage')
  teacherCandidates() {
    return this.programs.teacherCandidates();
  }

  @Get('admin/moodle/courses')
  @RequirePermission('programs:manage')
  moodleCourses() {
    return this.programs.moodleCourses();
  }
}
