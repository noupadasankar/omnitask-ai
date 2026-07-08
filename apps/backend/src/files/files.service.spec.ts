import { FilesService } from './files.service';
import type { FilesRepository } from './files.repository';

const mockRepo: jest.Mocked<
  Pick<FilesRepository, 'create' | 'findManyByUser' | 'findOneByUser' | 'update' | 'remove'>
> = {
  create: jest.fn(),
  findManyByUser: jest.fn(),
  findOneByUser: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
};

describe('FilesService', () => {
  let service: FilesService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new FilesService(mockRepo as unknown as FilesRepository);
  });

  describe('create', () => {
    it('computes storage fields and delegates to repo.create with a BigInt size', async () => {
      mockRepo.create.mockResolvedValue({ id: 'f1', sizeBytes: '123' } as any);

      const result = await service.create('u1', {
        name: 'a.txt',
        mimeType: 'text/plain',
        sizeBytes: 123,
      });

      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'u1',
          name: 'a.txt',
          mimeType: 'text/plain',
          sizeBytes: BigInt(123),
          bucketName: expect.any(String),
          checksum: expect.any(String),
          tags: [],
        }),
      );
      expect(result).toEqual({ id: 'f1', sizeBytes: '123' });
    });
  });

  describe('findAll', () => {
    it('returns hasMore=true and a nextCursor when the repo yields pageSize+1 items', async () => {
      const items = Array.from({ length: 21 }, (_, i) => ({ id: `f${i}`, sizeBytes: '0' }));
      mockRepo.findManyByUser.mockResolvedValue(items as any);

      const result = await service.findAll('u1', undefined, 20);

      expect(mockRepo.findManyByUser).toHaveBeenCalledWith('u1', 21, undefined);
      expect(result.hasMore).toBe(true);
      expect(result.data).toHaveLength(20);
      expect(result.nextCursor).toBe(Buffer.from('f19', 'utf-8').toString('base64url'));
    });

    it('returns hasMore=false and a null cursor when fewer than pageSize+1 items', async () => {
      mockRepo.findManyByUser.mockResolvedValue([{ id: 'f1', sizeBytes: '0' }] as any);

      const result = await service.findAll('u1', undefined, 20);

      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeNull();
      expect(result.data).toHaveLength(1);
    });

    it('decodes the incoming base64url cursor to an id', async () => {
      mockRepo.findManyByUser.mockResolvedValue([] as any);
      const cursor = Buffer.from('f5', 'utf-8').toString('base64url');

      await service.findAll('u1', cursor, 20);

      expect(mockRepo.findManyByUser).toHaveBeenCalledWith('u1', 21, 'f5');
    });
  });

  describe('findOne', () => {
    it('throws 404 when the file is not found', async () => {
      mockRepo.findOneByUser.mockResolvedValue(null);
      await expect(service.findOne('u1', 'missing')).rejects.toMatchObject({ status: 404 });
    });

    it('returns the file when found', async () => {
      mockRepo.findOneByUser.mockResolvedValue({ id: 'f1', sizeBytes: '0' } as any);
      const result = await service.findOne('u1', 'f1');
      expect(result).toEqual({ id: 'f1', sizeBytes: '0' });
    });
  });

  describe('update', () => {
    it('throws 404 (ownership guard) before touching repo.update', async () => {
      mockRepo.findOneByUser.mockResolvedValue(null);
      await expect(service.update('u1', 'missing', { name: 'x' })).rejects.toMatchObject({
        status: 404,
      });
      expect(mockRepo.update).not.toHaveBeenCalled();
    });

    it('delegates to repo.update after the ownership guard passes', async () => {
      mockRepo.findOneByUser.mockResolvedValue({ id: 'f1', sizeBytes: '0' } as any);
      mockRepo.update.mockResolvedValue({ id: 'f1', name: 'x', sizeBytes: '0' } as any);

      const result = await service.update('u1', 'f1', { name: 'x' });

      expect(mockRepo.update).toHaveBeenCalledWith('f1', expect.objectContaining({ name: 'x' }));
      expect(result).toEqual({ id: 'f1', name: 'x', sizeBytes: '0' });
    });
  });

  describe('remove', () => {
    it('throws 404 (ownership guard) before touching repo.remove', async () => {
      mockRepo.findOneByUser.mockResolvedValue(null);
      await expect(service.remove('u1', 'missing')).rejects.toMatchObject({ status: 404 });
      expect(mockRepo.remove).not.toHaveBeenCalled();
    });

    it('delegates to repo.remove after the ownership guard passes', async () => {
      mockRepo.findOneByUser.mockResolvedValue({ id: 'f1', sizeBytes: '0' } as any);
      mockRepo.remove.mockResolvedValue({ id: 'f1', sizeBytes: '0' } as any);

      await service.remove('u1', 'f1');

      expect(mockRepo.remove).toHaveBeenCalledWith('f1');
    });
  });
});
