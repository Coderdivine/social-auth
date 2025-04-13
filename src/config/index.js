require("dotenv").config();
const Twitter = require('twitter-v2');
const axios = require("axios");

const TWITTER_CLIENT_ID = process.env.X_CLIENT_ID || "";
const TWITTER_CLIENT_SECRET = process.env.X_CLIENT_SECRET || "";
const TWITTER_REDIRECT_URI = process.env.X_REDIRECT_URI || "http://localhost:5000/api/twitter/callback";
const BEARER_TOKEN = process.env.X_BEARER_TOKEN || "";
const ACCESS_TOKEN = process.env.X_ACCESS_TOKEN || "";
const ACCESS_SECRET = process.env.X_ACCESS_TOKEN_SECRET || "";
const TWITTER_API_SECRET =  process.env.X_API_KEY_SECRET || "";
const TWITTER_API_KEY = process.env.X_API_KEY || "";


const client = new Twitter({
  consumer_key: TWITTER_API_KEY,
  consumer_secret: TWITTER_API_SECRET,
  access_token_key: ACCESS_TOKEN,
  access_token_secret: ACCESS_SECRET
});

const createAPI = (Authorization) => {
    return axios.create({
        baseURL: "https://api.x.com/2",
        headers: {
          Authorization: `Bearer ${Authorization}`,
        },
    });
}

module.exports = {
    TWITTER_CLIENT_ID,
    TWITTER_CLIENT_SECRET,
    TWITTER_REDIRECT_URI,
    BEARER_TOKEN,
    client,
    ACCESS_TOKEN,
    ACCESS_SECRET,
    TWITTER_API_KEY,
    createAPI
}