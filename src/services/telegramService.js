// services/telegramService.js
const express = require('express');
const axios = require('axios');
const router = express.Router();
const { verifyTelegramAuth } = require('../utils/telegramAuth');
const UserSchema = require('../models/UserSchema');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const channelId = process.env.TELEGRAM_CHANNEL_ID || "";
const testUserId = "123";

router.post('/telegram-auth', async (req, res) => {
  const authData = req.body;
  if (!authData) {
    return res.status(400).json({ error: 'No authentication data provided' });
  }

  const verify = await verifyTelegramAuth(authData);

  if (!verify) {
    return res.status(400).json({ error: 'Invalid Telegram authentication data' });
  }

  const telegramUserId = authData.id;

  const user = await UserSchema.findOne({ user_id: testUserId });
  if(!user) throw new Error("Create a test user with the Id '123'");

  user.telegram_id = telegramUserId;
  user.telegram_username = authData.username;
  await user.save();

  try {
    const response = await axios.get(
      `https://api.telegram.org/bot${BOT_TOKEN}/getChatMember`,
      {
        params: {
          chat_id: channelId,
          user_id: telegramUserId,
        },
      }
    );

    const status = response.data.result.status;
    if (['creator', 'administrator', 'member'].includes(status)) {
      console.log({ authData });
      return res.json({ joined: true, userData: authData });
    } else {
      return res.json({ joined: false, userData: null });
    }
  } catch (error) {
    console.error('Telegram API error:', error.response?.data || error.message);
    return res.status(500).json({ error: 'Error verifying membership' });
  }
});


module.exports = router;