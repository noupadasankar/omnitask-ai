import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { FilesService } from './files.service';
import { CreateFileDto, UpdateFileDto } from './dto/file.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('files')
@UseGuards(JwtAuthGuard)
export class FilesController {
  constructor(private filesService: FilesService) {}

  @Get()
  findAll(@Request() req: { user: { id: string } }) {
    return this.filesService.findAll(req.user.id);
  }

  @Get(':id')
  findOne(@Request() req: { user: { id: string } }, @Param('id') id: string) {
    return this.filesService.findOne(req.user.id, id);
  }

  @Post()
  create(
    @Request() req: { user: { id: string } },
    @Body() createFileDto: CreateFileDto,
  ) {
    return this.filesService.create(req.user.id, createFileDto);
  }

  @Put(':id')
  update(
    @Request() req: { user: { id: string } },
    @Param('id') id: string,
    @Body() updateFileDto: UpdateFileDto,
  ) {
    return this.filesService.update(req.user.id, id, updateFileDto);
  }

  @Delete(':id')
  remove(@Request() req: { user: { id: string } }, @Param('id') id: string) {
    return this.filesService.remove(req.user.id, id);
  }
}
