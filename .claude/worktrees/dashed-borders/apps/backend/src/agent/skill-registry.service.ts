import { Injectable, Logger } from '@nestjs/common';

export interface SkillDefinition {
  name: string;
  description: string;
  parameters: Record<string, { type: string; description: string; required: boolean }>;
  instructions: string[];
}

@Injectable()
export class SkillRegistryService {
  private readonly logger = new Logger(SkillRegistryService.name);
  private registry = new Map<string, SkillDefinition>();

  constructor() {
    this.registerDefaultSkills();
  }

  private registerDefaultSkills() {
    this.logger.log('Registering default primitive universal Skills into registry');

    this.register('SearchSkill', {
      name: 'SearchSkill',
      description: 'Finds items, information, or URLs on search engines or target websites.',
      parameters: {
        query: { type: 'string', description: 'Search term or product keyword', required: true },
        engine: { type: 'string', description: 'Target website or search engine domain', required: false },
      },
      instructions: [
        'Open target website or search engine',
        'Locate search input field selector dynamically',
        'Type query string',
        'Submit search by pressing Enter or clicking search button',
        'Wait for search results viewport to complete rendering',
      ],
    });

    this.register('FormFillSkill', {
      name: 'FormFillSkill',
      description: 'Fills registrations, account signups, or application forms using persistent user profile card inputs.',
      parameters: {
        profileData: { type: 'object', description: 'Contextual contact card details from User Profile Memory', required: true },
        formSelectors: { type: 'object', description: 'CSS selectors for target input elements', required: false },
      },
      instructions: [
        'Navigate to the registration or application form URL',
        'Map form text inputs, selects, or textareas to profile attributes (email, name, phone)',
        'Execute clicks and safe-typing loops on matched selectors',
        'Review filled values visually to assert mapping accuracy',
        'Verify captcha check box or request OTP approval if visible',
      ],
    });

    this.register('CompareSkill', {
      name: 'CompareSkill',
      description: 'Scrapes listings across multiple pages and cross-references prices, metrics, or ratings.',
      parameters: {
        itemsCount: { type: 'number', description: 'Maximum number of items to aggregate', required: false },
        criteria: { type: 'string', description: 'Sort/filter parameters (e.g. cheapest price)', required: true },
      },
      instructions: [
        'Scroll down results page to trigger infinite scrolls or pagination',
        'Extract names, prices, and ratings from visible product cards',
        'Sort and compile comparisons report list',
      ],
    });

    this.register('PurchaseSkill', {
      name: 'PurchaseSkill',
      description: 'Manages additions to shopping carts, checkouts, and handles secure order payments.',
      parameters: {
        itemId: { type: 'string', description: 'Target element identifier', required: true },
        maxPrice: { type: 'number', description: 'Strict price cap guardrail', required: true },
      },
      instructions: [
        'Click Add to Cart or Buy Now button selector',
        'Open checkout cart summary page',
        'Inject shipping address card and click Next',
        'Halt execution loop and trigger payment confirmation approval challenge',
      ],
    });

    this.register('UploadSkill', {
      name: 'UploadSkill',
      description: 'Attaches files, resumes, or documents to input fields.',
      parameters: {
        fileKey: { type: 'string', description: 'Internal file pointer path', required: true },
        inputSelector: { type: 'string', description: 'File input HTML element selector', required: true },
      },
      instructions: [
        'Locate target file input field element',
        'Upload file content buffer directly using browser upload execution commands',
      ],
    });

    this.register('EmailSkill', {
      name: 'EmailSkill',
      description: 'Drafts, compiles, and sends mail messages using target portals.',
      parameters: {
        to: { type: 'string', description: 'Recipient address email', required: true },
        subject: { type: 'string', description: 'Message line header', required: true },
        body: { type: 'string', description: 'Body text content', required: true },
      },
      instructions: [
        'Navigate to mail portal',
        'Click compose email action triggers',
        'Type subject header, recipient addresses, and body message text',
        'Click Send button',
      ],
    });

    this.register('NavigationSkill', {
      name: 'NavigationSkill',
      description: 'Navigates page histories, refreshes viewports, or loads URLs.',
      parameters: {
        url: { type: 'string', description: 'Destination web address URL', required: false },
        actionType: { type: 'string', description: 'Sub-action (navigate, go_back, go_forward, refresh)', required: true },
      },
      instructions: [
        'Execute page navigation load or history traverse browser triggers',
        'Verify target page load completes',
      ],
    });

    this.register('DownloadSkill', {
      name: 'DownloadSkill',
      description: 'Initiates file downloads or grabs online attachments.',
      parameters: {
        selector: { type: 'string', description: 'CSS selector triggering the download', required: true },
      },
      instructions: [
        'Locate download action trigger element',
        'Click the button and monitor session for down-streamed content hooks',
      ],
    });
  }

  register(name: string, definition: SkillDefinition) {
    this.registry.set(name, definition);
    this.logger.debug(`Registered skill: ${name}`);
  }

  getSkill(name: string): SkillDefinition | undefined {
    return this.registry.get(name);
  }

  listSkills(): SkillDefinition[] {
    return Array.from(this.registry.values());
  }
}
