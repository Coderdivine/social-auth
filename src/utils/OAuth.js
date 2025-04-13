const crypto = require("crypto");
const Cache = require("../models/Cache");

const CACHE_DURATION = 15 * 60 * 1000;
const stateStore = {};


function generateCodeVerifier() {
  return crypto.randomBytes(32).toString("hex");
}

function base64UrlEncode(buffer) {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function generateCodeChallenge(verifier) {
  const hash = crypto.createHash("sha256").update(verifier).digest();
  return base64UrlEncode(hash);
}

async function getCached(key) {
  const record = await Cache.findOne({ key });
  if (record && Date.now() - record.timestamp.getTime() < CACHE_DURATION) {
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


module.exports = {
    generateCodeChallenge,
    generateCodeVerifier,
    getCached,
    setCached,
    stateStore
}