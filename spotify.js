const axios = require("axios");
require("dotenv").config();

class SpotifyAPI {
  constructor() {
    this.clientId = process.env.SPOTIFY_CLIENT_ID;
    this.clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
    this.refreshToken = process.env.SPOTIFY_REFRESH_TOKEN;
    this.accessToken = null;
    this.tokenExpiry = null;
  }

  async refreshAccessToken() {
    try {
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
    } catch (error) {
      console.error(
        "Error refreshing access token:",
        error.response?.data || error.message
      );
      throw error;
    }
  }

  async ensureValidToken() {
    if (
      !this.accessToken ||
      !this.tokenExpiry ||
      Date.now() >= this.tokenExpiry
    ) {
      await this.refreshAccessToken();
    }
    return this.accessToken;
  }

  async getCurrentTrack() {
    try {
      const token = await this.ensureValidToken();

      // First try to get currently playing track
      const currentResponse = await axios.get(
        "https://api.spotify.com/v1/me/player/currently-playing",
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      // If there's a track currently playing
      if (currentResponse.status === 200 && currentResponse.data) {
        const track = currentResponse.data.item;
        return {
          name: track.name,
          artist: track.artists[0].name,
          album: track.album.name,
          albumArt: track.album.images[0].url,
          playedAt: new Date().toISOString(),
          spotifyUrl: track.external_urls.spotify,
          isPlaying: true,
        };
      }

      // If no track is currently playing, get recently played
      const recentResponse = await axios.get(
        "https://api.spotify.com/v1/me/player/recently-played?limit=1",
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (recentResponse.data.items && recentResponse.data.items.length > 0) {
        const track = recentResponse.data.items[0].track;
        return {
          name: track.name,
          artist: track.artists[0].name,
          album: track.album.name,
          albumArt: track.album.images[0].url,
          playedAt: recentResponse.data.items[0].played_at,
          spotifyUrl: track.external_urls.spotify,
          isPlaying: false,
        };
      }

      return null;
    } catch (error) {
      console.error(
        "Error fetching track:",
        error.response?.data || error.message
      );
      throw error;
    }
  }
}

module.exports = new SpotifyAPI();
