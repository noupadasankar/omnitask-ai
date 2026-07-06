"""Research skill — search, read the top sources, synthesize a cited summary."""

import asyncio

from .base import Skill, SkillContext
from . import search, extract


class ResearchSkill(Skill):
    name = "research"

    async def run(self, ctx: SkillContext) -> dict:
        await ctx.log(f"Researching: {ctx.goal}", source="ResearchAgent")
        results = await search.web_search(ctx.page, ctx.goal)
        if not results:
            await ctx.log("No search results found.", source="ResearchAgent", level="warn")
            return self.ok([])

        top = results[:5]
        await ctx.log(f"Found {len(results)} results — reading top {len(top)}.", source="ResearchAgent")

        findings = []
        for i, r in enumerate(top):
            url = r.get("url")
            if not url:
                continue
            try:
                await ctx.page.goto(url, wait_until="domcontentloaded", timeout=25_000)
                await asyncio.sleep(1)
                text = await extract.page_text(ctx.page, limit=9000)
            except Exception:
                continue

            summary = None
            if ctx.ai.available and text:
                summary = await ctx.ai.summarize(
                    text,
                    f"Summarize this page's key facts relevant to: '{ctx.goal}'. "
                    "3-5 concise bullet points, no preamble.",
                )
            findings.append({
                "title": r.get("title"),
                "url": url,
                "summary": summary or (text[:400] if text else r.get("snippet", "")),
            })
            await ctx.log(f"[{i + 1}] {r.get('title', url)}", source="ResearchAgent")

        # Optional overall synthesis across sources.
        if ctx.ai.available and findings:
            combined = "\n\n".join(f"{f['title']}\n{f['summary']}" for f in findings)
            report = await ctx.ai.summarize(
                combined,
                f"Write a concise research brief answering: '{ctx.goal}'. "
                "Use bullet points and cite sources by their title.",
            )
            if report:
                await ctx.log("Research brief:\n" + report, source="ResearchAgent", level="success")

        await ctx.emit_result("research", findings)
        return self.ok(findings)
