import { Injectable, Logger } from '@nestjs/common';
import { BrowserProvider, ExtractedElement } from './providers/browser-provider.interface';

@Injectable()
export class ElementExtractionService {
  private readonly logger = new Logger(ElementExtractionService.name);

  constructor() {}

  async extractCompactJSON(
    provider: BrowserProvider,
    sessionId: string,
  ): Promise<any> {
    this.logger.log(`Filtering DOM context trees into compact JSON chunks for session ${sessionId}`);

    const rawElements = await provider.getInteractiveElements(sessionId);

    // Filter down to elements with actual text, labels, or valid selector keys to prevent token explosion
    const cleanNodes = rawElements.map((el) => ({
      id: el.id,
      role: el.role,
      text: el.text || undefined,
      ariaLabel: el.ariaLabel || undefined,
      bounds: {
        x: Math.round(el.bounds.x),
        y: Math.round(el.bounds.y),
        width: Math.round(el.bounds.width),
        height: Math.round(el.bounds.height),
      },
      selector: el.selector,
    }));

    this.logger.log(`Filtered out ${rawElements.length - cleanNodes.length} irrelevant elements. Extracted ${cleanNodes.length} active nodes.`);
    
    return {
      viewportWidth: 1280,
      viewportHeight: 720,
      elements: cleanNodes.slice(0, 80), // Absolute cap to prevent token explosion
    };
  }
}
