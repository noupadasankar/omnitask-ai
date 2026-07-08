import { UsersService } from './users.service';
import type { UsersRepository } from './users.repository';

const mockRepo: jest.Mocked<
  Pick<UsersRepository, 'findAll' | 'findById' | 'findByEmail' | 'updateUser' | 'deleteUser'>
> = {
  findAll: jest.fn(),
  findById: jest.fn(),
  findByEmail: jest.fn(),
  updateUser: jest.fn(),
  deleteUser: jest.fn(),
};

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new UsersService(mockRepo as unknown as UsersRepository);
  });

  describe('findAll', () => {
    it('should delegate to repo.findAll and return its result', async () => {
      const users = [{ id: 'u1', email: 'a@b.com', name: 'A', role: 'USER' }];
      mockRepo.findAll.mockResolvedValue(users as any);
      const result = await service.findAll();
      expect(result).toBe(users);
      expect(mockRepo.findAll).toHaveBeenCalledTimes(1);
    });
  });

  describe('update', () => {
    it('should update name only, skipping the email uniqueness check', async () => {
      mockRepo.findById.mockResolvedValue({ id: 'u1' } as any);
      mockRepo.updateUser.mockResolvedValue({ id: 'u1', name: 'New Name' } as any);

      const result = await service.update('u1', { name: 'New Name' });

      expect(mockRepo.findByEmail).not.toHaveBeenCalled();
      expect(mockRepo.updateUser).toHaveBeenCalledWith('u1', { name: 'New Name' });
      expect(result).toEqual({ id: 'u1', name: 'New Name' });
    });

    it('should throw 400 when the email belongs to a different user', async () => {
      mockRepo.findById.mockResolvedValue({ id: 'u1' } as any);
      mockRepo.findByEmail.mockResolvedValue({ id: 'u2', email: 'taken@b.com' } as any);

      await expect(service.update('u1', { email: 'taken@b.com' })).rejects.toMatchObject({
        status: 400,
        message: 'Email already in use',
      });
      expect(mockRepo.updateUser).not.toHaveBeenCalled();
    });

    it('should allow the email when it already belongs to the same user', async () => {
      mockRepo.findById.mockResolvedValue({ id: 'u1' } as any);
      mockRepo.findByEmail.mockResolvedValue({ id: 'u1', email: 'me@b.com' } as any);
      mockRepo.updateUser.mockResolvedValue({ id: 'u1', email: 'me@b.com' } as any);

      const result = await service.update('u1', { email: 'me@b.com' });

      expect(mockRepo.updateUser).toHaveBeenCalledWith('u1', { email: 'me@b.com' });
      expect(result).toEqual({ id: 'u1', email: 'me@b.com' });
    });

    it('should allow the email when no other user has it', async () => {
      mockRepo.findById.mockResolvedValue({ id: 'u1' } as any);
      mockRepo.findByEmail.mockResolvedValue(null);
      mockRepo.updateUser.mockResolvedValue({ id: 'u1', email: 'free@b.com' } as any);

      await service.update('u1', { email: 'free@b.com' });

      expect(mockRepo.updateUser).toHaveBeenCalledWith('u1', { email: 'free@b.com' });
    });

    it('should hash the password and store it as passwordHash', async () => {
      mockRepo.findById.mockResolvedValue({ id: 'u1' } as any);
      mockRepo.updateUser.mockResolvedValue({ id: 'u1' } as any);

      await service.update('u1', { password: 'Secret123!' });

      const data = mockRepo.updateUser.mock.calls[0][1];
      expect(data.passwordHash).toBeDefined();
      expect(data.passwordHash!.startsWith('$2')).toBe(true);
      expect(data.passwordHash).not.toBe('Secret123!');
      // password field is never forwarded verbatim to the repository
      expect(data).not.toHaveProperty('password');
    });

    it('should throw 404 when the user does not exist', async () => {
      mockRepo.findById.mockResolvedValue(null);

      await expect(service.update('missing', { name: 'X' })).rejects.toMatchObject({
        status: 404,
      });
      expect(mockRepo.updateUser).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('should throw 404 when the user does not exist', async () => {
      mockRepo.findById.mockResolvedValue(null);

      await expect(service.remove('missing')).rejects.toMatchObject({ status: 404 });
      expect(mockRepo.deleteUser).not.toHaveBeenCalled();
    });

    it('should delete the user when it exists', async () => {
      mockRepo.findById.mockResolvedValue({ id: 'u1' } as any);
      mockRepo.deleteUser.mockResolvedValue({ id: 'u1' } as any);

      const result = await service.remove('u1');

      expect(mockRepo.deleteUser).toHaveBeenCalledWith('u1');
      expect(result).toEqual({ id: 'u1' });
    });
  });
});
