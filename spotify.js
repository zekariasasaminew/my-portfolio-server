const axios = require("axios");
require("dotenv").config();

// Spotify is polled by this one server loop only; visitors read the in-memory
// cache, so Spotify traffic does not grow with the number of visitors.
const WATCHED_PLAYING_MS = 5 * 1000;
const WATCHED_PAUSED_MS = 15 * 1000;
const IDLE_MS = 60 * 1000;
const ERROR_MS = 30 * 1000;
const VIEWER_WINDOW_MS = 60 * 1000;
const TRACK_END_BUFFER_MS = 1000;

class SpotifyAPI {
  constructor() {
    this.clientId = process.env.SPOTIFY_CLIENT_ID;
    this.clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
    this.refreshToken = process.env.SPOTIFY_REFRESH_TOKEN;
    this.accessToken = null;
    this.tokenExpiry = null;
    this.cachedTrack = null;
    this.lastFetchAt = 0;
    this.lastViewerAt = 0;
    this.blockedUntil = 0;
    this.inFlight = null;
    this.timer = null;
  }

  async refreshAccessToken() {
    const response = await axios.post(
      "https://accounts.spotify.com/api/token",
      new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: this.refreshToken,
      }),
      {
        headers: {
          Authorization: `Basic ${Buffer.from(
            `${this.clientId}:${this.clientSecret}`
          ).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    this.accessToken = response.data.access_token;
    this.tokenExpiry = Date.now() + response.data.expires_in * 1000;
    return this.accessToken;
  }

  async ensureValidToken() {
    if (
      !this.accessToken ||
      !this.tokenExpiry ||
      Date.now() >= this.tokenExpiry - 60 * 1000
    ) {
      await this.refreshAccessToken();
    }
    return this.accessToken;
  }

  _toTrack(track, extra) {
    return {
      name: track.name,
      artist: track.artists?.[0]?.name ?? "Unknown artist",
      album: track.album?.name ?? "",
      albumArt: track.album?.images?.[0]?.url ?? null,
      spotifyUrl: track.external_urls?.spotify ?? null,
      ...extra,
    };
  }

  async _fetchFromSpotify() {
    const token = await this.ensureValidToken();
    const headers = { Authorization: `Bearer ${token}` };

    const current = await axios.get(
      "https://api.spotify.com/v1/me/player/currently-playing",
      { headers }
    );

    if (current.status === 200 && current.data) {
      // Ads and podcast episodes come back with no track item; keep the last song.
      if (!current.data.item) return this.cachedTrack;
      return this._toTrack(current.data.item, {
        isPlaying: current.data.is_playing,
        playedAt: new Date(
          current.data.is_playing ? Date.now() : current.data.timestamp
        ).toISOString(),
        progressMs: current.data.progress_ms,
        durationMs: current.data.item.duration_ms,
      });
    }

    // Nothing active. The recently-played list only changes while something
    // plays, so skip that second call when we already hold a stopped track.
    if (this.cachedTrack && !this.cachedTrack.isPlaying) return this.cachedTrack;

    const recent = await axios.get(
      "https://api.spotify.com/v1/me/player/recently-played?limit=1",
      { headers }
    );
    const item = recent.data.items?.[0];
    if (!item) return null;
    return this._toTrack(item.track, {
      isPlaying: false,
      playedAt: item.played_at,
    });
  }

  _nextDelay() {
    if (Date.now() - this.lastViewerAt >= VIEWER_WINDOW_MS) return IDLE_MS;
    const track = this.cachedTrack;
    if (!track?.isPlaying) return WATCHED_PAUSED_MS;
    const untilTrackEnds =
      track.durationMs - track.progressMs + TRACK_END_BUFFER_MS;
    return Math.max(1000, Math.min(WATCHED_PLAYING_MS, untilTrackEnds));
  }

  _refresh() {
    if (this.inFlight) return this.inFlight;
    clearTimeout(this.timer);

    this.inFlight = (async () => {
      let delay;
      try {
        this.cachedTrack = await this._fetchFromSpotify();
        this.lastFetchAt = Date.now();
        delay = this._nextDelay();
      } catch (error) {
        if (error.response?.status === 429) {
          const retryAfterSec = Number(error.response.headers["retry-after"]);
          delay = Math.max(ERROR_MS, (retryAfterSec || 60) * 1000);
          console.error(
            `Spotify rate limited (${
              error.response.data?.error?.reason || "rate"
            }), pausing ${delay / 1000}s`
          );
        } else {
          delay = ERROR_MS;
          console.error(
            "Spotify fetch failed:",
            error.response?.data || error.message
          );
        }
        this.blockedUntil = Date.now() + delay;
      } finally {
        this.inFlight = null;
      }
      this.timer = setTimeout(() => this._refresh(), delay);
    })();

    return this.inFlight;
  }

  // Serves from cache. A visitor arriving while the loop is in its slow idle
  // mode triggers one immediate refresh so the next poll sees fresh data.
  async getCurrentTrack() {
    const now = Date.now();
    const wasIdle = now - this.lastViewerAt >= VIEWER_WINDOW_MS;
    this.lastViewerAt = now;

    const canFetch = now >= this.blockedUntil;
    if (!this.lastFetchAt && canFetch) {
      await this._refresh();
    } else if (
      wasIdle &&
      canFetch &&
      now - this.lastFetchAt > WATCHED_PLAYING_MS
    ) {
      this._refresh();
    }
    return this.cachedTrack;
  }

  startPolling() {
    this._refresh().then(() =>
      console.log(
        "Spotify cache warmed:",
        this.cachedTrack?.name ?? "no track"
      )
    );
  }
}

module.exports = new SpotifyAPI();
