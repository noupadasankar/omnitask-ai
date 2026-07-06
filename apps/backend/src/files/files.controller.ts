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
<<<<<<< HEAD
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
=======
} from '@nestjs/common';
>>>>>>> dab0d299b342a0e08b58cf73f14bd0e9670f5835
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

<<<<<<< HEAD
  @Post('upload')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file'))
  uploadFile(
    @Request() req: { user: { id: string } },
    @UploadedFile() file: any,
    @Body('taskId') taskId?: string,
  ) {
    return this.filesService.uploadAndCreate(req.user.id, file, taskId);
  }

=======
>>>>>>> dab0d299b342a0e08b58cf73f14bd0e9670f5835
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
