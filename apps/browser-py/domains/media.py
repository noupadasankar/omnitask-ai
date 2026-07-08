"""Media domain, ported from apps/backend/src/media/ (media.service.ts +
media.controller.ts + dto/media.dto.ts). Same 5 endpoints, same request/
response shapes, so the frontend's services/media.service.ts (reverse-proxied
through the Node backend at /api/media) needs no changes.

One deliberate behavior change: the original service's search() had an
artificial `await new Promise(r => setTimeout(r, 500))` before returning fake
demo data — a no-value delay with nothing to actually await on, dropped here.
"""

import time
from typing import Literal, Optional
from urllib.parse import quote

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field, model_validator

from db.session_db import create_media_session, find_media_history
from http_api.auth import AuthedUser, require_user

router = APIRouter(prefix="/media", dependencies=[Depends(require_user)])

MediaType = Literal["track", "album", "artist", "playlist", "video"]
Provider = Literal["youtube", "spotify", "soundcloud"]


class MediaTrack(BaseModel):
    id: str
    title: str
    artist: str
    album: Optional[str] = None
    duration: int
    url: str
    thumbnail: Optional[str] = None
    provider: Provider


class MediaPlaybackResult(BaseModel):
    success: bool
    track: Optional[MediaTrack] = None
    action: str
    url: Optional[str] = None
    message: str


class PlayMediaBody(BaseModel):
    query: Optional[str] = Field(default=None, max_length=500)
    trackId: Optional[str] = Field(default=None, max_length=200)
    provider: Optional[str] = Field(default=None, max_length=50)

    @model_validator(mode="after")
    def _require_query_or_track_id(self) -> "PlayMediaBody":
        if not self.query and not self.trackId:
            raise ValueError("Provide query or trackId")
        return self


class QueueMediaBody(BaseModel):
    trackId: str = Field(min_length=1, max_length=200)
    provider: Optional[str] = Field(default=None, max_length=50)


class PauseMediaBody(BaseModel):
    provider: Optional[str] = Field(default=None, max_length=50)


def _search(query: str, type_: Optional[MediaType], limit: Optional[int]) -> list[MediaTrack]:
    now_ms = int(time.time() * 1000)
    results: list[MediaTrack] = []

    if type_ is None or type_ in ("track", "video"):
        results.append(MediaTrack(
            id=f"yt_{now_ms}_1",
            title=f"{query} - Official Music Video",
            artist="Various Artists",
            duration=240,
            url=f"https://music.youtube.com/search?q={quote(query)}",
            thumbnail="https://i.ytimg.com/vi/default.jpg",
            provider="youtube",
        ))
        results.append(MediaTrack(
            id=f"yt_{now_ms}_2",
            title=f"{query} (Lyrics)",
            artist="Featured Artist",
            duration=210,
            url=f"https://music.youtube.com/search?q={quote(query + ' lyrics')}",
            thumbnail="https://i.ytimg.com/vi/default.jpg",
            provider="youtube",
        ))

    if type_ is None or type_ in ("track", "album"):
        results.append(MediaTrack(
            id=f"sp_{now_ms}_1",
            title=query,
            artist="Popular Artist",
            album="Greatest Hits",
            duration=200,
            url=f"https://open.spotify.com/search/{quote(query)}",
            thumbnail="https://i.scdn.co/image/default",
            provider="spotify",
        ))

    return results[: limit or 10]


async def _play(user_id: str, track_id: str, provider: Optional[str]) -> MediaPlaybackResult:
    await create_media_session(user_id, provider or "youtube", "play", track_id)
    url = (
        f"https://open.spotify.com/track/{track_id}"
        if provider == "spotify"
        else f"https://music.youtube.com/watch?v={track_id}"
    )
    return MediaPlaybackResult(
        success=True,
        action="play",
        url=url,
        message=f"Playing track on {provider or 'YouTube Music'}",
    )


@router.get("/search", response_model=list[MediaTrack])
async def search(query: str, type: Optional[MediaType] = None, limit: Optional[int] = None):
    return _search(query, type, limit)


@router.post("/play", response_model=MediaPlaybackResult)
async def play(body: PlayMediaBody, user: AuthedUser = Depends(require_user)):
    if body.query:
        results = _search(body.query, "track", 1)
        if not results:
            return MediaPlaybackResult(success=False, action="play", message=f'No results found for "{body.query}"')
        track = results[0]
        return await _play(user.id, track.id, body.provider or track.provider)

    return await _play(user.id, body.trackId, body.provider)


@router.post("/queue", response_model=MediaPlaybackResult)
async def queue(body: QueueMediaBody, user: AuthedUser = Depends(require_user)):
    await create_media_session(user.id, body.provider or "youtube", "queue", body.trackId)
    return MediaPlaybackResult(success=True, action="queue", message=f"Track queued on {body.provider or 'YouTube Music'}")


@router.post("/pause", response_model=MediaPlaybackResult)
async def pause(body: PauseMediaBody, user: AuthedUser = Depends(require_user)):
    await create_media_session(user.id, body.provider or "youtube", "pause", None)
    return MediaPlaybackResult(success=True, action="pause", message="Playback paused")


@router.get("/history")
async def history(limit: int = 20, user: AuthedUser = Depends(require_user)):
    return await find_media_history(user.id, limit)
