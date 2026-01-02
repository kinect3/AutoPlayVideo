const express = require('express');
const cors = require('cors');
const configData = require('./config-data');

const app = express();
app.use(cors()); // Allow requests from any domain (crucial for extensions)

app.get('/api/selectors', (req, res) => {
  // Cache for 5 minutes (300s), but allow serving stale data for 10 mins (600s)
  // while fetching new data in background.
  res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');
  res.json(configData);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Viboot Server running on port ${PORT}`);
});