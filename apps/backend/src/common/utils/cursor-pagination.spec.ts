import { encodeCursor, decodeCursor, buildCursorResponse, createCursorArgs } from './cursor-pagination';

describe('cursor-pagination utilities', () => {
  describe('encodeCursor', () => {
    it('should encode id to base64url', () => {
      const result = encodeCursor('test-id');
      expect(typeof result).toBe('string');
      expect(result).not.toContain('=');
    });

    it('should produce consistent output for same input', () => {
      expect(encodeCursor('abc')).toBe(encodeCursor('abc'));
    });

    it('should handle empty string', () => {
      expect(encodeCursor('')).toBe('');
    });

    it('should handle special characters', () => {
      const encoded = encodeCursor('user@id+123');
      expect(encoded).toBeTruthy();
      expect(decodeCursor(encoded)).toBe('user@id+123');
    });
  });

  describe('decodeCursor', () => {
    it('should decode base64url to original id', () => {
      const id = 'my-cursor-id';
      const cursor = encodeCursor(id);
      expect(decodeCursor(cursor)).toBe(id);
    });

    it('should return undefined for empty string', () => {
      expect(decodeCursor('')).toBeUndefined();
    });

    it('should return undefined for non-base64url input', () => {
      const result = decodeCursor('!!!');
      expect(result).toBeUndefined();
    });

    it('should round-trip UUIDs correctly', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      expect(decodeCursor(encodeCursor(uuid))).toBe(uuid);
    });
  });

  describe('buildCursorResponse', () => {
    it('should return data and no cursor when fewer items than take', () => {
      const items = [{ id: '1' }, { id: '2' }];
      const result = buildCursorResponse(items, 10);
      expect(result.data).toHaveLength(2);
      expect(result.nextCursor).toBeNull();
      expect(result.hasMore).toBe(false);
    });

    it('should return hasMore true when items exceed take', () => {
      const items = [{ id: '1' }, { id: '2' }, { id: '3' }];
      const result = buildCursorResponse(items, 2);
      expect(result.data).toHaveLength(2);
      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).toBe(encodeCursor('2'));
    });

    it('should return null cursor when no items', () => {
      const result = buildCursorResponse([], 10);
      expect(result.data).toHaveLength(0);
      expect(result.nextCursor).toBeNull();
      expect(result.hasMore).toBe(false);
    });

    it('should handle single item exactly at take limit', () => {
      const items = [{ id: '1' }];
      const result = buildCursorResponse(items, 1);
      expect(result.data).toHaveLength(1);
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeNull();
    });

    it('should handle exactly take+1 items', () => {
      const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
      const result = buildCursorResponse(items, 2);
      expect(result.data).toHaveLength(2);
      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).toBe(encodeCursor('b'));
    });
  });

  describe('createCursorArgs', () => {
    it('should return take+1 when no cursor', () => {
      const args = createCursorArgs(undefined, 20);
      expect(args.take).toBe(21);
      expect(args.skip).toBe(0);
      expect(args.cursor).toBeUndefined();
    });

    it('should include skip and cursor when cursor provided', () => {
      const cursor = encodeCursor('abc123');
      const args = createCursorArgs(cursor, 10);
      expect(args.take).toBe(11);
      expect(args.skip).toBe(1);
      expect(args.cursor).toEqual({ id: 'abc123' });
    });

    it('should default take to 20', () => {
      const args = createCursorArgs(undefined);
      expect(args.take).toBe(21);
    });

    it('should handle invalid cursor gracefully', () => {
      const args = createCursorArgs('!!!');
      expect(args.take).toBe(21);
      expect(args.skip).toBe(0);
      expect(args.cursor).toBeUndefined();
    });
  });
});
