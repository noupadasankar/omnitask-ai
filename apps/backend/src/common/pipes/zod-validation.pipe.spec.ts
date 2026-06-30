import { BadRequestException } from '@nestjs/common';
import { ZodValidationPipe } from './zod-validation.pipe';
import { z } from 'zod';

describe('ZodValidationPipe', () => {
  const schema = z.object({
    email: z.string().email(),
    age: z.number().int().min(0).max(150),
  });

  let pipe: ZodValidationPipe;

  beforeEach(() => {
    pipe = new ZodValidationPipe(schema);
  });

  it('should pass valid data through', () => {
    const data = { email: 'test@example.com', age: 25 };
    expect(pipe.transform(data)).toEqual(data);
  });

  it('should throw BadRequestException on invalid email', () => {
    expect(() => pipe.transform({ email: 'not-an-email', age: 25 })).toThrow(BadRequestException);
  });

  it('should throw BadRequestException on missing field', () => {
    expect(() => pipe.transform({ email: 'test@test.com' })).toThrow(BadRequestException);
  });

  it('should throw BadRequestException with field errors', () => {
    try {
      pipe.transform({ email: 'bad', age: -1 });
    } catch (e: any) {
      expect(e.response.errors).toBeDefined();
      expect(e.response.errors.email).toBeDefined();
      expect(e.response.errors.age).toBeDefined();
    }
  });

  it('should throw BadRequestException on completely wrong type', () => {
    expect(() => pipe.transform('not-an-object')).toThrow(BadRequestException);
  });

  it('should coerce string to number when Zod allows', () => {
    const coercingSchema = z.object({ count: z.coerce.number().int().min(0) });
    const coercingPipe = new ZodValidationPipe(coercingSchema);
    const result = coercingPipe.transform({ count: '42' });
    expect(result.count).toBe(42);
  });

  it('should throw on null input', () => {
    expect(() => pipe.transform(null)).toThrow(BadRequestException);
  });

  it('should throw on undefined input', () => {
    expect(() => pipe.transform(undefined)).toThrow(BadRequestException);
  });
});
