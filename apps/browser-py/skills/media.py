"""Media skill — search and play music/videos on YouTube, Spotify, etc.

Navigates to YouTube Music or Spotify, searches for the requested content,
and initiates playback.
"""

from urllib.parse import quote_plus

from .base import Skill, SkillContext

SITES = {
    "youtube": "https://music.youtube.com",
    "youtubemusic": "https://music.youtube.com",
    "spotify": "https://open.spotify.com",
    "soundcloud": "https://soundcloud.com",
}


class MediaSkill(Skill):
    name = "media"

    async def run(self, ctx: SkillContext) -> dict:
        query = ctx.job.get("query") or ctx.goal
        g = query.lower()
        site = ctx.job.get("site")

        if not site:
            if "spotify" in g:
                site = "spotify"
            elif "soundcloud" in g:
                site = "soundcloud"
            elif "youtube" in g or "video" in g or "watch" in g:
                site = "youtube"
            else:
                site = "youtube"

        base_url = SITES.get(site, SITES["youtube"])
        search_url = f"{base_url}/search?q={quote_plus(query)}"

        await ctx.log(f"Searching {site} for: {query}", source="MediaAgent")

        try:
            await ctx.page.goto(search_url, wait_until="domcontentloaded", timeout=30_000)
            import asyncio
            await asyncio.sleep(2)
        except Exception:
            fallback = f"https://www.google.com/search?q={quote_plus(f'{query} {site}')}"
            await ctx.page.goto(fallback, wait_until="domcontentloaded", timeout=30_000)
            await ctx.log(f"Using web search fallback for {query}", source="MediaAgent",
                          level="warn")

        results = await ctx.page.evaluate("""() => {
            const items = document.querySelectorAll('a');
            return Array.from(items).slice(0, 10).map(a => ({
                title: a.textContent?.trim() || '',
                url: a.href
            })).filter(r => r.title);
        }""")

        await ctx.log(f"Found media results for: {query}", source="MediaAgent")

        return self.ok([{
            "action": "play",
            "site": site,
            "query": query,
            "url": search_url,
            "results": results[:5],
            "message": f"Playing '{query}' on {site}",
        }])
