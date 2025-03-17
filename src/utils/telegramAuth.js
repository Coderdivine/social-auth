const crypto = require('crypto');
require('dotenv').config();
const botToken = process.env.TELEGRAM_BOT_TOKEN.trim(); 

async function verifyTelegramAuth(authData) {
  // Extract the hash and the remaining data
  const { hash, ...data } = authData;
  if (!hash) return false;

  // Optional: Check if the auth_date is too old (e.g., older than one day)
  if (data.auth_date) {
    const authDate = Number(String(data.auth_date));
    const currentTime = Math.floor(Date.now() / 1000);
    const maxAge = 86400; // 1 day in seconds
    if (currentTime - authDate > maxAge) {
      console.log('Telegram login request is too old.');
      return false;
    }
  }

  // Convert all values to strings (and trim if needed)
  const filteredData = {};
  Object.keys(data).forEach((key) => {
    if (data[key] !== undefined && data[key] !== null) {
      // Convert each value to a string
      filteredData[key] = String(data[key]);
    }
  });


  // Build the data check string by sorting the keys and joining them with newlines.
  // Each pair is formatted as "key=value".
  const dataCheckString = Object.keys(filteredData)
    .sort()
    .map((key) => `${key}=${filteredData[key]}`)
    .join('\n');

  // Trim the bot token from your environment variable
  

  // Compute the secret key as the SHA-256 hash of your bot token
  const secretKey = crypto.createHash('sha256').update(botToken).digest();

  // Compute the HMAC-SHA256 of the data check string using the secret key
  const computedHash = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  // console.log("Data Check String:", dataCheckString);
  // console.log("Computed Hash:", computedHash);
  // console.log("Provided Hash:", hash);

  return computedHash === hash;
}

module.exports = { verifyTelegramAuth };
