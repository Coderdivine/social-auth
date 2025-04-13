const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const userSchema = new Schema({
  user_id: { type: String, required: true, unique: true },
  x_username: { type: String, required: false },
  telegram_username: { type: String, required: false },
  x_id: { type:String, required: false },
  telegram_id: { type: String, required: false },
  accessToken: { type: String, required: false },
  timestamp: { type: Date, default: Date.now() }
});

module.exports = mongoose.model('telegram-username', userSchema);
