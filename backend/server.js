const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const connectDB = require('./config/db');

// Load environment variables
dotenv.config();
console.log('JWT SECRET:', process.env.JWT_SECRET);
// Connect to MongoDB
connectDB();

const app = express();

// Middleware
app.use(cors());
app.use(express.json()); // JSON body parse karne ke liye

// Test route (check karne ke liye server chal raha hai ya nahi)
app.get('/', (req, res) => {
  res.send('FoodSafetyHub Backend API is running... 🚀');
});

// Routes (abhi khaali, aage add karenge)
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/reviews', require('./routes/reviewRoutes'));
app.use('/api/ml', require('./routes/mlRoutes'));

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});