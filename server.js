const express = require("express");
const cors = require("cors");
const spotify = require("./spotify");
const https = require("https");
const httpsLocalhost = require("https-localhost")();
const axios = require("axios");
require("dotenv").config();

const app = express();
const PORT = 3001;
const REDIRECT_URI = "https://127.0.0.1:3001/callback";
const SCOPES = [
  "user-read-currently-playing",
  "user-read-recently-played",
  "user-read-playback-state",
].join(" ");

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get("/", (req, res) => {
  res.json({ status: "Server is running" });
});

// Login endpoint to get new token with correct permissions
app.get("/login", (req, res) => {
  const authUrl = `https://accounts.spotify.com/authorize?client_id=${
    process.env.SPOTIFY_CLIENT_ID
  }&response_type=code&redirect_uri=${encodeURIComponent(
    REDIRECT_URI
  )}&scope=${encodeURIComponent(SCOPES)}`;

  res.redirect(authUrl);
});

// Callback endpoint after Spotify auth
app.get("/callback", async (req, res) => {
  const code = req.query.code;

  try {
    const response = await axios.post(
      "https://accounts.spotify.com/api/token",
      new URLSearchParams({
        grant_type: "authorization_code",
        code: code,
        redirect_uri: REDIRECT_URI,
      }),
      {
        headers: {
          Authorization: `Basic ${Buffer.from(
            `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
          ).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    res.send(`
      <h1>Success!</h1>
      <p>Here's your new refresh token (save this in your .env file):</p>
      <code style="word-break: break-all;">${response.data.refresh_token}</code>
      <p>Replace your SPOTIFY_REFRESH_TOKEN in .env with this new token.</p>
    `);
  } catch (error) {
    console.error(
      "Error getting tokens:",
      error.response?.data || error.message
    );
    res.status(500).send("Error getting tokens");
  }
});

// Spotify track endpoint
app.get("/api/spotify/current-track", async (req, res) => {
  try {
    const track = await spotify.getCurrentTrack();
    if (track) {
      res.json(track);
    } else {
      res.status(404).json({ message: "No track data available" });
    }
  } catch (error) {
    console.error("Error:", error.response?.data || error.message);
    res.status(500).json({
      message: "Failed to fetch track data",
      error: error.response?.data?.error?.message || error.message,
    });
  }
});

// Start HTTPS server
async function startServer() {
  try {
    console.log("Getting SSL certificates...");
    const certs = await httpsLocalhost.getCerts();

    const httpsServer = https.createServer(certs, app);

    httpsServer.listen(PORT, "127.0.0.1", () => {
      console.log(`Server running at https://127.0.0.1:${PORT}`);
      console.log("Available endpoints:");
      console.log(`1. Health check: https://127.0.0.1:${PORT}/`);
      console.log(`2. Login: https://127.0.0.1:${PORT}/login`);
      console.log(
        `3. Current track: https://127.0.0.1:${PORT}/api/spotify/current-track`
      );
    });

    httpsServer.on("error", (error) => {
      if (error.code === "EADDRINUSE") {
        console.error(
          "Port is already in use. Please try again in a few moments or use a different port."
        );
        process.exit(1);
      } else {
        console.error("Server error:", error);
      }
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

startServer();
