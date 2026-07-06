import { Injectable, Logger } from '@nestjs/common';
import { ElementInfo, PageModel, RawDomNode } from './vision.types';

const BUTTON_TAGS = new Set(['button']);
const INPUT_TAGS = new Set(['input', 'select', 'textarea']);
const LINK_TAGS = new Set(['a']);
const FORM_TAGS = new Set(['form']);

@Injectable()
export class DomAnalyzerService {
  private readonly logger = new Logger(DomAnalyzerService.name);

  /**
   * Layer 1 — Build a structured PageModel from raw DOM nodes.
   * Fast path: no LLM, no screenshot.
   */
  buildPageModel(url: string, title: string, rawNodes: RawDomNode[]): PageModel {
    const elements = rawNodes
      .filter((n) => n.visible && n.bounds.width > 0 && n.bounds.height > 0)
      .map((n) => this.normalizeElement(n));

    const buttons = elements.filter(
      (el) =>
        BUTTON_TAGS.has(el.tag) ||
        el.role === 'button' ||
        (el.tag === 'input' && ['submit', 'button'].includes(el.inputType || '')),
    );

    const inputs = elements.filter(
      (el) =>
        INPUT_TAGS.has(el.tag) &&
        !['submit', 'button', 'hidden'].includes(el.inputType || ''),
    );

    const links = elements.filter(
      (el) => LINK_TAGS.has(el.tag) || el.role === 'link',
    );

    const forms = elements.filter((el) => FORM_TAGS.has(el.tag));

    this.logger.debug(
      `[DomAnalyzer] ${url} → ${buttons.length} buttons, ${inputs.length} inputs, ${links.length} links`,
    );

    return {
      url,
      title,
      buttons,
      inputs,
      forms,
      links,
      allElements: elements,
    };
  }

  /** Extract site key from URL for site-memory lookups */
  extractSiteKey(url: string): string {
    try {
      const host = new URL(url).hostname.replace(/^www\./, '');
      return host.split('.')[0] || host;
    } catch {
      return 'unknown';
    }
  }

  private normalizeElement(node: RawDomNode): ElementInfo {
    const text = (node.text || node.ariaLabel || '').trim().slice(0, 120);
    return {
      id: node.id,
      tag: node.tag,
      role: node.role || node.tag,
      text,
      ariaLabel: node.ariaLabel || '',
      selector: node.selector,
      href: node.href,
      inputType: node.inputType,
      bounds: node.bounds,
      visible: node.visible,
    };
  }
}
