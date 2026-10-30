const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const connectDB = require('./config/db');

// Load environment variables
dotenv.config({ path: require('path').join(__dirname, '.env') });
console.log('JWT SECRET loaded:', process.env.JWT_SECRET ? 'Yes' : 'No');
// Connect to MongoDB
connectDB();

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '2mb' })); // Raised to 2mb for custom CSV training payloads

// Error handling for payload size limit (413) and malformed JSON
app.use((err, req, res, next) => {
  if (err && (err.type === 'entity.too.large' || err.status === 413)) {
    return res.status(413).json({ message: 'Request payload too large (maximum allowed size is 2MB)' });
  }
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ message: 'Invalid JSON payload' });
  }
  next(err);
});

// Health check endpoint for Docker / orchestration
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'food-safety-backend-api' });
});

// Test route (check karne ke liye server chal raha hai ya nahi)
app.get('/', (req, res) => {
  res.send('FoodSafetyHub Backend API is running... 🚀');
});

// Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/reviews', require('./routes/reviewRoutes'));
app.use('/api/ml', require('./routes/mlRoutes'));
app.use('/api/safety', require('./routes/foodSafetyRoutes'));
app.use('/api/v1', require('./routes/foodSafetyRoutes'));

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});