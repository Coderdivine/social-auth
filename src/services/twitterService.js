const express = require("express");
const axios = require("axios");
const crypto = require("crypto");
const qs = require("querystring");
const Cache = require("../models/Cache");
const UserSchema = require("../models/UserSchema");
const router = express.Router();
const {
  client,
  TWITTER_CLIENT_ID,
  TWITTER_CLIENT_SECRET,
  TWITTER_REDIRECT_URI,
  BEARER_TOKEN,
  createAPI,
  ACCESS_TOKEN,
  TWITTER_API_KEY,
} = require("../config");
const {
  generateCodeChallenge,
  generateCodeVerifier,
  getCached,
  setCached,
  stateStore,
} = require("../utils/OAuth");
const xAPI = createAPI(BEARER_TOKEN);


// UserSchema.findOne({ user_id: "123" })
// .then((user) => { console.log({ user }) });


router.get("/auth", async (req, res) => {
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
    const authUrl =
      "https://twitter.com/i/oauth2/authorize?" + qs.stringify(params);
    console.log({ authUrl });
    return res.redirect(authUrl);
  } catch (error) {
    console.error("Error generating auth link:", error);
    return res.status(500).json({ error: "Error generating auth link" });
  }
});

router.get("/callback", async (req, res) => {
  const { state, code } = req.query;
  console.log({ state, code });
  const codeVerifier = stateStore[state];
  console.log({ codeVerifier });
  
  if (!codeVerifier) {
    return res.status(400).json({ error: "Invalid state" });
  }
  delete stateStore[state];

  try {
    const testUserId = "123";
    const testUser = await UserSchema.findOne({ user_id: testUserId });
    if (!testUser) throw new Error("Create a test user with the Id '123'");

    const tokenUrl = "https://api.x.com/2/oauth2/token";
    const tokenParams = {
      code: code,
      grant_type: "authorization_code",
      redirect_uri: TWITTER_REDIRECT_URI,
      code_verifier: codeVerifier,
    };

    const authHeader = `Basic ${Buffer.from(
      `${TWITTER_CLIENT_ID}:${TWITTER_CLIENT_SECRET}`
    ).toString("base64")}`;

    const tokenRes = await axios.post(tokenUrl, qs.stringify(tokenParams), {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: authHeader,
      },
    });

    const accessToken = tokenRes.data.access_token;
    console.log({ accessToken, ACCESS_TOKEN });
    const userRes = await axios.get("https://api.x.com/2/users/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: { "user.fields": "public_metrics,created_at,verified" },
    });

    const user = userRes.data.data;
    console.log({ user });

    testUser.x_username = user?.username;
    testUser.x_id = user?.id;
    testUser.accessToken = accessToken;
    console.log("Saved X details");
    await testUser.save();

    return res.redirect(
      `http://localhost:3000/dashboard?username=${user.username}&id=${user.id}`
    );
  } catch (error) {
    console.error(
      "Error during OAuth callback:",
      error.response?.data || error.message
    );

    return res.redirect(
      `http://localhost:3000/dashboard?status=${"An error occurred during authentication"}`
    );
  }
});

router.get("/get-user", async (req, res) => {
  try {
    const user = await UserSchema.findOne({ user_id: "123" });
    if (!user) throw new Error("Create a test user with the Id '123'");
    return res.status(200).json(user);
  } catch (error) {
    return res
      .status(500)
      .json({ error: "Unable to get user details", details: error.message });
  }
});

router.get("/user", async (req, res) => {
  const username = req.query.username;
  try {
    const userUrl = `/users/by/username/${encodeURIComponent(username)}`;
    const response = await xAPI.get(userUrl, {
      headers: { Authorization: `Bearer ${BEARER_TOKEN}` },
      params: { "user.fields": "public_metrics,created_at,verified" },
    });
    return res.json(response.data);
  } catch (error) {
    console.error(
      "Error fetching user:",
      error.response?.data || error.message
    );
    return res.status(500).json({
      error: "Error fetching user",
      details: error.response?.data || error.message,
    });
  }
});

router.get("/check-retweet", async (req, res) => {
  const { tweetId, userId } = req.query;
  try {
    const user_details = await UserSchema.findOne({ x_id: userId });
    if (!user_details || !user_details.accessToken) {
      throw new Error("User not found or access token missing");
    }
    const accessToken = user_details.accessToken;
    console.log({ accessToken });

    let retweetersCombined = [];
    let paginationToken;

    const retweetUrl = `/tweets/${encodeURIComponent(tweetId)}/retweeted_by`;
    const response = await xAPI.get(retweetUrl, {
      headers: { Authorization: `Bearer ${BEARER_TOKEN}` },
      params: {
        max_results: 100,
        ...(paginationToken ? { pagination_token: paginationToken } : {}),
      },
    });
    const retweeters = response.data.data || [];
    retweetersCombined = retweetersCombined.concat(retweeters);
    paginationToken = response.data.meta?.next_token;
    console.log({ retweeters, retweetersCombined, paginationToken });

    const hasRetweeted = retweetersCombined.some((u) => u.id === userId);
    return res.json({ retweeters: retweetersCombined, hasRetweeted });
  } catch (error) {
    console.error(
      "Error checking retweet:",
      error.response?.data || error.message
    );
    return res.status(500).json({
      error: "Error checking retweet",
      details: error.response?.data?.details || error.message,
    });
  }
});

router.get("/check-likes", async (req, res) => {
  const { tweetId, userId } = req.query;
  try {
    const user_details = await UserSchema.findOne({ x_id: userId });
    if (!user_details || !user_details.accessToken) {
      throw new Error("User not found or access token missing");
    }
    const accessToken = user_details.accessToken;
    console.log({ accessToken });

    let likesCombined = [];
    let paginationToken;
    const retweetUrl = `/tweets/${encodeURIComponent(tweetId)}/liking_users`;
    const response = await xAPI.get(retweetUrl, {
      headers: { Authorization: `Bearer ${BEARER_TOKEN}` },
      params: {
        max_results: 100,
        ...(paginationToken ? { pagination_token: paginationToken } : {}),
      },
    });
    const likes = response.data.data || [];
    likesCombined = likesCombined.concat(likes);
    paginationToken = response.data.meta?.next_token;
    console.log({ likes, likesCombined, paginationToken });

    const hasRetweeted = likesCombined.some((u) => u.id === userId);
    return res.json({ retweeters: likesCombined, hasRetweeted });

  } catch (error) {
    console.error(
      "Error checking retweet:",
      error.response?.data || error.message
    );
    return res.status(500).json({
      error: "Error checking retweet",
      details: error.response?.data?.details || error.message,
    });
  }
});


















// Enterpise Endpoint

router.get("/check-follow", async (req, res) => {
  const { userId, targetUserId } = req.query;

  try {
    // Fetch the user from the database using the userId from the query
    const user = await UserSchema.findOne({ x_id: userId });
    if (!user || !user.accessToken) {
      throw new Error("User not found or access token missing");
    }
    const accessToken = user.accessToken;
    console.log({ accessToken });

    let followingCombined = [];
    let paginationToken;
    do {
      const followingUrl = `https://api.twitter.com/2/users/${encodeURIComponent(
        userId
      )}/following`;
      const response = await axios.get(followingUrl, {
        headers: { Authorization: `Bearer ${BEARER_TOKEN}` },
        params: {
          max_results: 1000,
          ...(paginationToken ? { pagination_token: paginationToken } : {}),
        },
      });
      const following = response.data.data || [];
      followingCombined = followingCombined.concat(following);
      paginationToken = response.data.meta?.next_token;
    } while (paginationToken);

    const isFollowing = followingCombined.some((u) => u.id === targetUserId);
    return res.json({ following: followingCombined, isFollowing });
  } catch (error) {
    if (
      error.response &&
      error.response.data &&
      error.response.data.reason === "client-not-enrolled"
    ) {
      console.error(
        "Twitter API error: Client Not Enrolled. Ensure your Twitter developer app is attached to a Project with appropriate API access."
      );
      return res.status(500).json({
        error: "Error checking follow",
        details:
          "Client Not Enrolled. Ensure your Twitter developer app is attached to a Project with the appropriate API access.",
      });
    }
    console.error(
      "Error checking follow:",
      error.response?.data || error.message
    );
    return res.status(500).json({
      error: "Error checking follow",
      details: error.response?.data || error.message,
    });
  }
});

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
    const response = await xAPI.get(userUrl, {
      headers: { Authorization: `Bearer ${BEARER_TOKEN}` },
      params: { "user.fields": "public_metrics" },
    });
    const user = response.data.data;
    await setCached(cacheKey, user);
    const followersCount = user.public_metrics?.followers_count || 0;
    const isSmartFollower = followersCount >= minFollowers;
    return res.json({ user, isSmartFollower });
  } catch (error) {
    console.error(
      "Error checking smart follower:",
      error.response?.data || error.message
    );
    return res.status(500).json({
      error: "Error checking smart follower",
      details: error.response?.data || error.message,
    });
  }
});

module.exports = router;
