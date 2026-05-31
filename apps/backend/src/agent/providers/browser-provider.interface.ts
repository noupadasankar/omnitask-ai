export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ExtractedElement {
  id: string;
  role: string;
  text: string;
  ariaLabel: string;
  bounds: BoundingBox;
  selector: string;
}

export interface BrowserProvider {
  launch(sessionId: string, userId: string, config: { headless?: boolean; width?: number; height?: number }): Promise<void>;
  navigate(sessionId: string, url: string): Promise<string>;
  click(sessionId: string, target: string): Promise<void>;
  type(sessionId: string, target: string, value: string): Promise<void>;
  screenshot(sessionId: string): Promise<string>;
  getInteractiveElements(sessionId: string): Promise<ExtractedElement[]>;
  close(sessionId: string): Promise<void>;
  getCookies(sessionId: string): Promise<any[]>;
  setCookies(sessionId: string, cookies: any[]): Promise<void>;
}
