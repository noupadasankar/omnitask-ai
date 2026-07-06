import { Controller, Post, Body, UseGuards, Request } from '@nestjs/common';
import { PlanningService } from './planning.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { z } from 'zod';

const PlanRequestSchema = z.object({
  naturalLanguage: z.string().min(3),
});

@Controller('planning')
@UseGuards(JwtAuthGuard)
export class PlanningController {
  constructor(private readonly planningService: PlanningService) {}

  @Post()
  generate(
    @Request() req: { user: { id: string } },
    @Body(new ZodValidationPipe(PlanRequestSchema))
    body: z.infer<typeof PlanRequestSchema>,
  ) {
    return this.planningService.generatePlan(body.naturalLanguage, req.user.id);
  }
}
