import { Controller, Get, Post, Patch, Param, Body, UseGuards, Request } from '@nestjs/common';
import { ConfirmationService } from './confirmation.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { IsObject, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

class EditFieldsDto {
  @IsObject()
  @IsOptional()
  fields: Record<string, unknown> = {};
}

@Controller('confirmation')
@UseGuards(JwtAuthGuard)
export class ConfirmationController {
  constructor(private readonly confirmationService: ConfirmationService) {}

  @Get('pending')
  listPending(@Request() req: any) {
    return this.confirmationService.listPending(req.user.id);
  }

  @Get(':id')
  getOne(@Param('id') id: string, @Request() req: any) {
    return this.confirmationService.getOne(id, req.user.id);
  }

  @Patch(':id/edit')
  edit(
    @Param('id') id: string,
    @Body() body: EditFieldsDto,
    @Request() req: any,
  ) {
    return this.confirmationService.edit(id, req.user.id, body.fields ?? {});
  }

  @Post(':id/confirm')
  confirm(@Param('id') id: string, @Request() req: any) {
    return this.confirmationService.confirm(id, req.user.id);
  }

  @Post(':id/reject')
  reject(@Param('id') id: string, @Request() req: any) {
    return this.confirmationService.reject(id, req.user.id);
  }
}
