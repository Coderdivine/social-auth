// models/Cache.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const cacheSchema = new Schema({
  key: { type: String, required: true, unique: true },
  data: { type: Schema.Types.Mixed },
  timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Telegram-Cache', cacheSchema);
