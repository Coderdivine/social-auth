// index.js
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: '*' }));
app.use(bodyParser.json());

// Import service routes
const telegramService = require('./services/telegramService');
const twitterService = require('./services/twitterService');

// Use the services routes
app.use('/api', telegramService);
app.use('/api/twitter', twitterService);

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("MongoDB connection error:", err));
});
