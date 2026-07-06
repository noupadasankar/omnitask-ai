import { Test, TestingModule } from '@nestjs/testing';
import { SkillRegistryService } from './skill-registry.service';

describe('SkillRegistryService', () => {
  let service: SkillRegistryService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SkillRegistryService],
    }).compile();
    service = module.get<SkillRegistryService>(SkillRegistryService);
  });

  it('should register 8 default skills on init', () => {
    const skills = service.listSkills();
    expect(skills).toHaveLength(8);
  });

  it('should register SearchSkill with correct structure', () => {
    const skill = service.getSkill('SearchSkill');
    expect(skill).toBeDefined();
    expect(skill!.name).toBe('SearchSkill');
    expect(skill!.parameters.query).toBeDefined();
    expect(skill!.parameters.query.required).toBe(true);
    expect(skill!.instructions.length).toBeGreaterThan(0);
  });

  it('should register FormFillSkill with profileData parameter', () => {
    const skill = service.getSkill('FormFillSkill');
    expect(skill!.parameters.profileData.required).toBe(true);
    expect(skill!.parameters.formSelectors.required).toBe(false);
  });

  it('should register NavigationSkill with actionType parameter', () => {
    const skill = service.getSkill('NavigationSkill');
    expect(skill).toBeDefined();
    expect(skill!.parameters.actionType.required).toBe(true);
  });

  it('should return undefined for unregistered skill', () => {
    expect(service.getSkill('NonExistentSkill')).toBeUndefined();
  });

  it('should list all 8 default skills by name', () => {
    const names = service.listSkills().map(s => s.name).sort();
    expect(names).toEqual([
      'CompareSkill', 'DownloadSkill', 'EmailSkill',
      'FormFillSkill', 'NavigationSkill', 'PurchaseSkill',
      'SearchSkill', 'UploadSkill',
    ]);
  });

  it('should allow registering new skills at runtime', () => {
    service.register('CustomSkill', {
      name: 'CustomSkill',
      description: 'A custom skill',
      parameters: { apiKey: { type: 'string', description: 'API key', required: true } },
      instructions: ['Call API', 'Process result'],
    });

    const skill = service.getSkill('CustomSkill');
    expect(skill).toBeDefined();
    expect(skill!.description).toBe('A custom skill');
  });

  it('should override existing skill on re-register', () => {
    service.register('SearchSkill', {
      name: 'SearchSkill',
      description: 'Overridden description',
      parameters: {},
      instructions: ['New instructions'],
    });

    const skill = service.getSkill('SearchSkill');
    expect(skill!.description).toBe('Overridden description');
    expect(skill!.instructions).toEqual(['New instructions']);
  });
});
