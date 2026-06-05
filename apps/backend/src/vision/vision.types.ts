export interface ElementBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Normalized interactive element from DOM extraction */
export interface ElementInfo {
  id: string;
  tag: string;
  role: string;
  text: string;
  ariaLabel: string;
  selector: string;
  href?: string;
  inputType?: string;
  bounds: ElementBounds;
  visible: boolean;
}

/** Layer 1 — fast DOM page model (no screenshot) */
export interface PageModel {
  url: string;
  title: string;
  buttons: ElementInfo[];
  inputs: ElementInfo[];
  forms: ElementInfo[];
  links: ElementInfo[];
  allElements: ElementInfo[];
}

/** Layer 3 — spatial layout regions */
export interface LayoutModel {
  header: ElementInfo[];
  sidebar: ElementInfo[];
  mainContent: ElementInfo[];
  footer: ElementInfo[];
  modals: ElementInfo[];
  pageState:
    | 'normal'
    | 'loading'
    | 'blocked_by_popup'
    | 'captcha_present'
    | 'login_wall'
    | 'error_page';
  hasModal: boolean;
  modalDescription?: string;
}

/** Layer 2 — semantic match result */
export interface SemanticMatchResult {
  element: ElementInfo | null;
  selectorMatched: string;
  matchedText: string;
  confidence: number;
  reasoning: string;
  source: 'site_memory' | 'dom_text' | 'dom_semantic' | 'vision_fallback';
  actionRequired?: 'click' | 'type' | 'wait' | 'close_popup' | 'none';
}

/** Full vision analysis bundle */
export interface VisionAnalysisResult {
  pageModel: PageModel;
  layout: LayoutModel;
  analyzedAt: number;
  usedVisionFallback: boolean;
}

/** Raw DOM node from worker/browser evaluate */
export interface RawDomNode {
  id: string;
  tag: string;
  role: string;
  text: string;
  ariaLabel: string;
  selector: string;
  href?: string;
  inputType?: string;
  bounds: ElementBounds;
  visible: boolean;
}
