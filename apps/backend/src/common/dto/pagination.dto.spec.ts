import { CursorPaginationSchema } from './pagination.dto';

describe('CursorPaginationSchema', () => {
  it('should accept valid cursor and take', () => {
    const result = CursorPaginationSchema.parse({ cursor: 'abc123', take: 30 });
    expect(result.cursor).toBe('abc123');
    expect(result.take).toBe(30);
  });

  it('should default take to 20', () => {
    const result = CursorPaginationSchema.parse({});
    expect(result.take).toBe(20);
    expect(result.cursor).toBeUndefined();
  });

  it('should coerce string take to number', () => {
    const result = CursorPaginationSchema.parse({ take: '15' });
    expect(result.take).toBe(15);
  });

  it('should reject negative take', () => {
    expect(() => CursorPaginationSchema.parse({ take: -1 })).toThrow();
  });

  it('should reject take of 0', () => {
    expect(() => CursorPaginationSchema.parse({ take: 0 })).toThrow();
  });

  it('should reject take over 100', () => {
    expect(() => CursorPaginationSchema.parse({ take: 150 })).toThrow();
  });

  it('should accept cursor as optional string', () => {
    const result = CursorPaginationSchema.parse({ cursor: 'some-cursor' });
    expect(result.cursor).toBe('some-cursor');
  });

  it('should reject non-numeric take', () => {
    expect(() => CursorPaginationSchema.parse({ take: 'abc' })).toThrow();
  });
});
