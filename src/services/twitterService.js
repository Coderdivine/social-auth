const express = require("express");
const axios = require("axios");
const crypto = require("crypto");
const qs = require("querystring");
const Cache = require("../models/Cache");

const router = express.Router();

const TWITTER_CLIENT_ID = process.env.X_CLIENT_ID || "YOUR_TWITTER_CLIENT_ID";
const TWITTER_CLIENT_SECRET = process.env.X_CLIENT_SECRET || "YOUR_TWITTER_CLIENT_SECRET";
const TWITTER_REDIRECT_URI = process.env.X_REDIRECT_URI || "http://localhost:5000/api/twitter/callback";
const BEARER_TOKEN = process.env.X_BEARER_TOKEN || "NO_BEARER_TOKEN";



// Axios instance for API calls using the Bearer token
const xAPI = axios.create({
  baseURL: "https://api.x.com/2",
  headers: {
    Authorization: `Bearer ${BEARER_TOKEN}`,
  },
});

// Cache duration: 15 minutes in milliseconds
const CACHE_DURATION = 15 * 60 * 1000;

// In-memory store for PKCE state (for demo purposes)
const stateStore = {};

// Utility functions for PKCE
function generateCodeVerifier() {
  return crypto.randomBytes(32).toString("hex");
}

function base64UrlEncode(buffer) {
  return buffer.toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function generateCodeChallenge(verifier) {
  const hash = crypto.createHash("sha256").update(verifier).digest();
  return base64UrlEncode(hash);
}

// Helper functions to manage cache in MongoDB using Mongoose
async function getCached(key) {
  const record = await Cache.findOne({ key });
  if (record && (Date.now() - record.timestamp.getTime() < CACHE_DURATION)) {
    return record.data;
  }
  return null;
}

async function setCached(key, data) {
  await Cache.findOneAndUpdate(
    { key },
    { data, timestamp: new Date() },
    { upsert: true, new: true }
  );
}

// ---------- OAuth Endpoints ----------

// GET /api/twitter/auth
router.get("/auth", (req, res) => {
  try {
    const state = crypto.randomBytes(16).toString("hex");
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    stateStore[state] = codeVerifier;
    const scope = "tweet.read users.read follows.read offline.access";
    const params = {
      response_type: "code",
      client_id: TWITTER_CLIENT_ID,
      redirect_uri: TWITTER_REDIRECT_URI,
      scope: scope,
      state: state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    };
    const authUrl = "https://twitter.com/i/oauth2/authorize?" + qs.stringify(params);
    console.log({ authUrl });
    return res.redirect(authUrl);
  } catch (error) {
    console.error("Error generating auth link:", error);
    return res.status(500).json({ error: "Error generating auth link" });
  }
});

// GET /api/twitter/callback
router.get("/callback", async (req, res) => {
  const { state, code } = req.query;
  console.log({ state, code });
  const codeVerifier = stateStore[state];
  if (!codeVerifier) {
    return res.status(400).json({ error: "Invalid state" });
  }
  delete stateStore[state];

  try {
    const tokenUrl = "https://api.x.com/2/oauth2/token";
    const tokenParams = {
      code: code,
      grant_type: "authorization_code",
      client_id: TWITTER_CLIENT_ID,
      redirect_uri: TWITTER_REDIRECT_URI,
      code_verifier: codeVerifier,
    };
    const tokenRes = await axios.post(tokenUrl, qs.stringify(tokenParams), {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    const accessToken = tokenRes.data.access_token;
    const userRes = await axios.get("https://api.x.com/2/users/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: { "user.fields": "public_metrics,created_at,verified" },
    });
    const user = userRes.data.data;
    console.log({ user });
    return res.redirect(
      `http://localhost:3000/dashboard?username=${user.username}&id=${user.id}`
    );
  } catch (error) {
    console.error("Error during OAuth callback:", error.response?.data || error.message);
    return res.status(500).json({ error: "OAuth callback error", details: error.response?.data || error.message });
  }
});

// ---------- Verification Endpoints ----------

// GET /api/twitter/user?username=...
// This endpoint is not cached.
router.get("/user", async (req, res) => {
  const username = req.query.username;
  try {
    const userUrl = `https://api.x.com/2/users/by/username/${encodeURIComponent(username)}`;
    const response = await axios.get(userUrl, {
      headers: { Authorization: `Bearer ${BEARER_TOKEN}` },
      params: { "user.fields": "public_metrics,created_at,verified" },
    });
    return res.json(response.data);
  } catch (error) {
    console.error("Error fetching user:", error.response?.data || error.message);
    return res.status(500).json({ error: "Error fetching user", details: error.response?.data || error.message });
  }
});

// GET /api/twitter/check-retweet?tweetId=...&userId=...
router.get("/check-retweet", async (req, res) => {
  const { tweetId, userId } = req.query;
  const cacheKey = `check-retweet:${tweetId}:${userId}`;
  const cachedData = await getCached(cacheKey);
  if (cachedData) {
    const hasRetweeted = cachedData.some(u => u.id === userId);
    return res.json({ retweeters: cachedData, hasRetweeted });
  }
  try {
    let retweetersCombined = [];
    let paginationToken;
    do {
      const retweetUrl = `https://api.x.com/2/tweets/${encodeURIComponent(tweetId)}/retweeted_by`;
      const response = await axios.get(retweetUrl, {
        headers: { Authorization: `Bearer ${BEARER_TOKEN}` },
        params: {
          max_results: 100,
          // ...(paginationToken ? { pagination_token: paginationToken } : {}),
        },
      });
      const retweeters = response.data.data || [];
      retweetersCombined = retweetersCombined.concat(retweeters);
      paginationToken = response.data.meta?.next_token;
    } while (paginationToken);
    await setCached(cacheKey, retweetersCombined);
    const hasRetweeted = retweetersCombined.some(u => u.id === userId);
    return res.json({ retweeters: retweetersCombined, hasRetweeted });
  } catch (error) {
    console.error("Error checking retweet:", error.response?.data || error.message);
    return res.status(500).json({ error: "Error checking retweet", details: error.response?.data || error.message });
  }
});

// GET /api/twitter/check-follow?userId=...&targetUserId=...
router.get("/check-follow", async (req, res) => {
  const { userId, targetUserId } = req.query;
  const cacheKey = `check-follow:${userId}:${targetUserId}`;
  const cachedData = await getCached(cacheKey);
  if (cachedData) {
    const isFollowing = cachedData.some(u => u.id === targetUserId);
    return res.json({ following: cachedData, isFollowing });
  }
  try {
    let followingCombined = [];
    let paginationToken;
    do {
      const followingUrl = `https://api.x.com/2/users/${encodeURIComponent(userId)}/following`;
      const response = await axios.get(followingUrl, {
        headers: { Authorization: `Bearer ${BEARER_TOKEN}` },
        params: {
          max_results: 1000,
          // ...(paginationToken ? { pagination_token: paginationToken } : {}),
        },
      });
      const following = response.data.data || [];
      followingCombined = followingCombined.concat(following);
      paginationToken = response.data.meta?.next_token;
    } while (paginationToken);
    await setCached(cacheKey, followingCombined);
    const isFollowing = followingCombined.some(u => u.id === targetUserId);
    return res.json({ following: followingCombined, isFollowing });
  } catch (error) {
    if (
      error.response &&
      error.response.data &&
      error.response.data.reason === "client-not-enrolled"
    ) {
      console.error("Twitter API error: Client Not Enrolled. Ensure your Twitter developer app is attached to a Project with appropriate API access.");
      return res.status(500).json({
        error: "Error checking follow",
        details: "Client Not Enrolled. Ensure your Twitter developer app is attached to a Project with the appropriate API access.",
      });
    }
    console.error("Error checking follow:", error.response?.data || error.message);
    return res.status(500).json({ error: "Error checking follow", details: error.response?.data || error.message });
  }
});

// GET /api/twitter/check-smart-follower?userId=...&minFollowers=...
router.get("/check-smart-follower", async (req, res) => {
  const { userId } = req.query;
  const minFollowers = parseInt(req.query.minFollowers, 10) || 50;
  const cacheKey = `check-smart-follower:${userId}:${minFollowers}`;
  const cachedData = await getCached(cacheKey);
  if (cachedData) {
    const followersCount = cachedData.public_metrics?.followers_count || 0;
    const isSmartFollower = followersCount >= minFollowers;
    return res.json({ user: cachedData, isSmartFollower });
  }
  try {
    const userUrl = `https://api.x.com/2/users/${encodeURIComponent(userId)}`;
    const response = await axios.get(userUrl, {
      headers: { Authorization: `Bearer ${BEARER_TOKEN}` },
      params: { "user.fields": "public_metrics" },
    });
    const user = response.data.data;
    await setCached(cacheKey, user);
    const followersCount = user.public_metrics?.followers_count || 0;
    const isSmartFollower = followersCount >= minFollowers;
    return res.json({ user, isSmartFollower });
  } catch (error) {
    console.error("Error checking smart follower:", error.response?.data || error.message);
    return res.status(500).json({ error: "Error checking smart follower", details: error.response?.data || error.message });
  }
});

module.exports = router;
