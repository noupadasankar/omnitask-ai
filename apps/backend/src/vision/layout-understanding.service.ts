import { Injectable, Logger } from '@nestjs/common';
import { LlmService } from '../common/llm/llm.service';
import { ElementInfo, LayoutModel, PageModel } from './vision.types';

export interface PageLayout {
  hasModal: boolean;
  modalDescription?: string;
  hasSidebar: boolean;
  mainContentArea: string;
  pageState: 'normal' | 'loading' | 'blocked_by_popup' | 'captcha_present' | 'login_wall' | 'error_page';
  layoutSections: Array<{
    name: string;
    box: { x: number; y: number; width: number; height: number };
    description: string;
  }>;
}

@Injectable()
export class LayoutUnderstandingService {
  private readonly logger = new Logger(LayoutUnderstandingService.name);

  constructor(private readonly llm: LlmService) {}

  /**
   * Layer 3 — Fast DOM-based layout analysis (no LLM).
   * Detects header/sidebar/main/footer/modals from element positions.
   */
  analyzeFromDom(pageModel: PageModel, viewport = { width: 1280, height: 800 }): LayoutModel {
    const { width, height } = viewport;
    const header: ElementInfo[] = [];
    const sidebar: ElementInfo[] = [];
    const mainContent: ElementInfo[] = [];
    const footer: ElementInfo[] = [];
    const modals: ElementInfo[] = [];

    for (const el of pageModel.allElements) {
      const { y, x, width: w } = el.bounds;
      const text = `${el.text} ${el.ariaLabel}`.toLowerCase();

      // Modal / dialog detection
      if (
        el.role === 'dialog' ||
        el.role === 'alertdialog' ||
        text.includes('cookie') ||
        text.includes('accept all') ||
        text.includes('newsletter') ||
        (el.bounds.width > width * 0.4 && el.bounds.height > height * 0.3 && y > height * 0.15 && y < height * 0.7)
      ) {
        modals.push(el);
        continue;
      }

      if (y < height * 0.12) header.push(el);
      else if (y > height * 0.88) footer.push(el);
      else if (x < width * 0.18 && w < width * 0.25) sidebar.push(el);
      else if (x > width * 0.82 && w < width * 0.25) sidebar.push(el);
      else mainContent.push(el);
    }

    const pageState = this.inferPageState(pageModel, modals);

    return {
      header,
      sidebar,
      mainContent,
      footer,
      modals,
      pageState,
      hasModal: modals.length > 0,
      modalDescription: modals[0]?.text || modals[0]?.ariaLabel,
    };
  }

  private inferPageState(
    pageModel: PageModel,
    modals: ElementInfo[],
  ): LayoutModel['pageState'] {
    const url = pageModel.url.toLowerCase();
    const title = pageModel.title.toLowerCase();
    const bodyText = pageModel.allElements.map((e) => e.text).join(' ').toLowerCase();

    if (url.includes('authwall') || url.includes('/login') || url.includes('/signin')) {
      return 'login_wall';
    }
    if (bodyText.includes('captcha') || bodyText.includes('verify you are human')) {
      return 'captcha_present';
    }
    if (title.includes('error') || bodyText.includes('page not found') || bodyText.includes('404')) {
      return 'error_page';
    }
    if (modals.some((m) => `${m.text} ${m.ariaLabel}`.toLowerCase().includes('cookie'))) {
      return 'blocked_by_popup';
    }
    if (modals.length > 0) return 'blocked_by_popup';
    if (bodyText.includes('loading') && pageModel.allElements.length < 5) {
      return 'loading';
    }
    return 'normal';
  }

  /** Vision fallback for layout when DOM is insufficient */
  async understandLayout(screenshotBase64: string): Promise<PageLayout> {
    this.logger.debug('Analyzing page layout grid with GPT-4o Vision...');
    const systemPrompt = `You are a layout structure analyzer. Look at the page screenshot and describe the structural grid.
Identify if there are modals open, sidebars, main content panels, and what state the page is in.

Output strict JSON:
{
  "hasModal": boolean,
  "modalDescription": "description of modal if present",
  "hasSidebar": boolean,
  "mainContentArea": "description of content area",
  "pageState": "normal|loading|blocked_by_popup|captcha_present|login_wall|error_page",
  "layoutSections": [
    {
      "name": "header|sidebar|main|modal|footer|toast",
      "box": { "x": number, "y": number, "width": number, "height": number },
      "description": "short description"
    }
  ]
}`;
    try {
      const response = await this.llm.getClient().chat.completions.create({
        model: this.llm.visionModel,
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Identify the structural layout and state from this screenshot:' },
              {
                type: 'image_url',
                image_url: { url: `data:image/jpeg;base64,${screenshotBase64}`, detail: 'high' },
              },
            ],
          },
        ],
        temperature: 0.1,
        max_tokens: 1000,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) throw new Error('Empty layout response');
      return JSON.parse(content) as PageLayout;
    } catch (err: any) {
      this.logger.error(`Layout understanding failed: ${err.message}`);
      return {
        hasModal: false,
        hasSidebar: false,
        mainContentArea: 'unknown',
        pageState: 'normal',
        layoutSections: [],
      };
    }
  }
}
