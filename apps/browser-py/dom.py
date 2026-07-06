"""Interactive-DOM extraction for the self-healing payload.

Faithful port of `extractRawDom` in apps/worker/src/processors/browser-task.processor.ts
so the Node SelfHealingService receives the same node shape it already understands.
"""

RAW_DOM_JS = r"""
(() => {
  const viewport = { width: window.innerWidth, height: window.innerHeight };
  const isVisible = (el, bounds) => {
    if (bounds.width <= 0 || bounds.height <= 0) return false;
    if (bounds.bottom < 0 || bounds.right < 0) return false;
    if (bounds.top > viewport.height || bounds.left > viewport.width) return false;
    const style = window.getComputedStyle(el);
    return style.visibility !== 'hidden' && style.display !== 'none' && style.opacity !== '0';
  };
  const buildSelector = (el) => {
    const tag = el.tagName.toLowerCase();
    if (el.id) return tag + '#' + el.id;
    const aria = el.getAttribute('aria-label');
    if (aria) return tag + '[aria-label="' + aria.replace(/"/g, '\\"') + '"]';
    const cls = el.className;
    if (typeof cls === 'string' && cls.trim()) {
      const first = cls.trim().split(/\s+/)[0];
      if (first && !first.includes(':')) return tag + '.' + first;
    }
    return tag;
  };
  const nodes = document.querySelectorAll(
    'a, button, input, select, textarea, form, [role="button"], [role="link"], [role="dialog"]'
  );
  return Array.from(nodes).map((el, index) => {
    const bounds = el.getBoundingClientRect();
    const tag = el.tagName.toLowerCase();
    return {
      id: 'node_' + index,
      tag,
      role: el.getAttribute('role') || tag,
      text: (el.textContent || '').trim().slice(0, 120),
      ariaLabel: el.getAttribute('aria-label') || '',
      selector: buildSelector(el),
      href: tag === 'a' ? el.href : undefined,
      inputType: tag === 'input' ? el.type : undefined,
      bounds: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
      visible: isVisible(el, bounds),
    };
  });
})()
"""


async def extract_raw_dom(page) -> list:
    try:
        return await page.evaluate(RAW_DOM_JS)
    except Exception:
        return []
