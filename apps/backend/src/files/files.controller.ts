import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FilesService } from './files.service';
import { CreateFileDto, UpdateFileDto, CreateFileDtoSchema, UpdateFileDtoSchema } from './dto/file.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CursorPaginationSchema } from '../common/dto/pagination.dto';
import type { CursorPaginationDto } from '../common/dto/pagination.dto';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';

@Controller('files')
@UseGuards(JwtAuthGuard)
export class FilesController {
  constructor(private filesService: FilesService) {}

  @Get()
  findAll(
    @Request() req: { user: { id: string } },
    @Query(new ZodValidationPipe(CursorPaginationSchema)) query: CursorPaginationDto,
  ) {
    return this.filesService.findAll(req.user.id, query.cursor, query.take);
  }

  @Get(':id')
  findOne(@Request() req: { user: { id: string } }, @Param('id') id: string) {
    return this.filesService.findOne(req.user.id, id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Request() req: { user: { id: string } },
    @Body(new ZodValidationPipe(CreateFileDtoSchema)) createFileDto: CreateFileDto,
  ) {
    return this.filesService.create(req.user.id, createFileDto);
  }

  @Put(':id')
  update(
    @Request() req: { user: { id: string } },
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateFileDtoSchema)) updateFileDto: UpdateFileDto,
  ) {
    return this.filesService.update(req.user.id, id, updateFileDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Request() req: { user: { id: string } }, @Param('id') id: string) {
    return this.filesService.remove(req.user.id, id);
  }
}
