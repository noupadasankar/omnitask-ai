"""Perception — turn a live page into a compact, semantic observation.

The model never sees raw HTML or pixel coordinates. Instead, each interactive
element gets a stable `[ref]` id (written as a `data-cog-ref` attribute so the
tool executor can re-locate it within the same step) plus its resolved label,
value, role and options. This is the DOM half of the "multi-modal understanding"
layer; the screenshot (see ToolExecutor.screenshot) is the visual half, fetched
on demand only when the DOM is ambiguous.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional

# Interactive elements worth surfacing to the model.
_INTERACTIVE_SELECTOR = (
    "a[href], button, input, select, textarea, "
    "[role=button], [role=link], [role=checkbox], [role=radio], "
    "[role=combobox], [role=tab], [role=menuitem], [contenteditable=true]"
)

_MAX_ELEMENTS = 80
_MAX_TEXT = 1800

# Runs in the page. Tags every visible interactive element with data-cog-ref=N
# and returns its metadata. Visibility = has layout box, not display:none /
# visibility:hidden / opacity:0. Inputs report their type, value and checked
# state; selects report their option texts; everything reports a resolved label.
_OBSERVE_JS = r"""
(maxEls) => {
  const SEL = "%SEL%";
  const labelFor = (el) => {
    try {
      const esc = (s) => (window.CSS && CSS.escape) ? CSS.escape(s) : s;
      if (el.id) {
        const l = document.querySelector('label[for="' + esc(el.id) + '"]');
        if (l && l.innerText.trim()) return l.innerText.trim();
      }
      if (el.getAttribute('aria-label')) return el.getAttribute('aria-label').trim();
      const lb = el.getAttribute('aria-labelledby');
      if (lb) { const n = document.getElementById(lb); if (n && n.innerText.trim()) return n.innerText.trim(); }
      let node = el;
      for (let i = 0; i < 4 && node; i++) {
        node = node.parentElement;
        if (!node) break;
        const lab = node.querySelector('label, legend');
        if (lab && lab.innerText.trim()) return lab.innerText.trim();
      }
      return el.placeholder || '';
    } catch (e) { return ''; }
  };
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const s = window.getComputedStyle(el);
    return s.display !== 'none' && s.visibility !== 'hidden' && parseFloat(s.opacity || '1') > 0.05;
  };

  // Clear stale refs from a previous observation.
  document.querySelectorAll('[data-cog-ref]').forEach(e => e.removeAttribute('data-cog-ref'));

  const els = Array.from(document.querySelectorAll(SEL));
  const out = [];
  let ref = 0;

  // A best-effort STABLE selector for an element (id → name → aria-label →
  // type), used by the selector-memory cache to recognise the same control on a
  // later visit. Never used to ACT (acting is by data-cog-ref); only a hint.
  const stableSelector = (el) => {
    try {
      const esc = (s) => (window.CSS && CSS.escape) ? CSS.escape(s) : s;
      if (el.id) return '#' + esc(el.id);
      const tag = el.tagName.toLowerCase();
      const name = el.getAttribute('name');
      if (name) return tag + '[name="' + name + '"]';
      const al = el.getAttribute('aria-label');
      if (al) return tag + '[aria-label="' + al.slice(0, 60) + '"]';
      const t = (el.getAttribute('type') || '');
      if (t) return tag + '[type="' + t + '"]';
      return '';
    } catch (e) { return ''; }
  };

  for (const el of els) {
    if (out.length >= maxEls) break;
    if (!visible(el)) continue;
    const tag = el.tagName.toLowerCase();
    const type = (el.getAttribute('type') || '').toLowerCase();
    if (tag === 'input' && (type === 'hidden')) continue;
    el.setAttribute('data-cog-ref', String(ref));
    const item = {
      ref,
      tag,
      type: type || null,
      role: el.getAttribute('role') || null,
      label: labelFor(el).slice(0, 160),
      text: (el.innerText || el.value || '').trim().slice(0, 100),
      selector: stableSelector(el),
      disabled: !!el.disabled,
    };
    if (tag === 'input' && (type === 'checkbox' || type === 'radio')) {
      item.checked = !!el.checked;
      item.name = el.getAttribute('name') || null;
    } else if (tag === 'input' || tag === 'textarea') {
      item.value = (el.value || '').slice(0, 120);
    } else if (tag === 'select') {
      item.value = (el.options[el.selectedIndex] ? el.options[el.selectedIndex].text : '').trim();
      item.options = Array.from(el.options).slice(0, 18).map(o => (o.text || '').trim()).filter(Boolean);
    }
    out.push(item);
    ref++;
  }
  return {
    url: location.href,
    title: document.title,
    text: (document.body ? document.body.innerText : '').replace(/\s+\n/g, '\n').trim().slice(0, %MAXTEXT%),
    elements: out,
  };
}
""".replace("%SEL%", _INTERACTIVE_SELECTOR).replace("%MAXTEXT%", str(_MAX_TEXT))


@dataclass
class Observation:
    url: str
    title: str
    text: str
    elements: List[Dict[str, Any]]

    def selector_for(self, ref: int) -> str:
        """The stable selector captured for a ref this observation (or '')."""
        for e in self.elements:
            if e.get("ref") == ref:
                return e.get("selector") or ""
        return ""

    def render(self, *, known_selectors: Optional[set] = None) -> str:
        """Human/LLM-readable observation block. When `known_selectors` is given,
        elements whose stable selector was acted on successfully before are marked
        ✓ so the model prefers them."""
        lines = [f"URL: {self.url}", f"TITLE: {self.title}", "", "INTERACTIVE ELEMENTS:"]
        if not self.elements:
            lines.append("  (none detected)")
        for e in self.elements:
            kind = e["tag"] + (f":{e['type']}" if e.get("type") else "")
            parts = [f"[{e['ref']}] {kind}"]
            if e.get("label"):
                parts.append(f'label="{e["label"]}"')
            if e.get("text") and e["text"] != e.get("label"):
                parts.append(f'text="{e["text"]}"')
            if "value" in e and e.get("value"):
                parts.append(f'value="{e["value"]}"')
            if "checked" in e:
                parts.append("CHECKED" if e["checked"] else "unchecked")
            if e.get("options"):
                parts.append("options=[" + ", ".join(e["options"]) + "]")
            if e.get("disabled"):
                parts.append("(disabled)")
            if known_selectors and e.get("selector") in known_selectors:
                parts.append("✓known-good")
            lines.append("  " + " ".join(parts))
        excerpt = self.text[:1200]
        lines += ["", "PAGE TEXT (excerpt):", excerpt]
        return "\n".join(lines)


class Perception:
    """Builds observations from a Playwright page."""

    def __init__(self, page):
        self.page = page

    async def observe(self) -> Observation:
        try:
            data = await self.page.evaluate(_OBSERVE_JS, _MAX_ELEMENTS)
        except Exception:
            # A navigation may be mid-flight; give the model a minimal view.
            try:
                url = self.page.url
            except Exception:
                url = ""
            return Observation(url=url, title="", text="(page not ready)", elements=[])
        return Observation(
            url=data.get("url", ""),
            title=data.get("title", ""),
            text=data.get("text", ""),
            elements=data.get("elements", []),
        )
