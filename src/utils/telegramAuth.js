const crypto = require('crypto');
require('dotenv').config();
const botToken = process.env.TELEGRAM_BOT_TOKEN.trim(); 

async function verifyTelegramAuth(authData) {
  const { hash, ...data } = authData;
  if (!hash) return false;

  if (data.auth_date) {
    const authDate = Number(String(data.auth_date));
    const currentTime = Math.floor(Date.now() / 1000);
    const maxAge = 86400; // 1 day in seconds
    if (currentTime - authDate > maxAge) {
      console.log('Telegram login request is too old.');
      return false;
    }
  }

  const filteredData = {};
  Object.keys(data).forEach((key) => {
    if (data[key] !== undefined && data[key] !== null) {
      // Convert each value to a string
      filteredData[key] = String(data[key]);
    }
  });


  const dataCheckString = Object.keys(filteredData)
    .sort()
    .map((key) => `${key}=${filteredData[key]}`)
    .join('\n');

  const secretKey = crypto.createHash('sha256').update(botToken).digest();

  const computedHash = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  return computedHash === hash;
}

module.exports = { verifyTelegramAuth };
