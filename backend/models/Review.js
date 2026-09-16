const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: { type: String, required: true },
  cat: { type: String },
  verdict: { type: String },
  score: { type: Number },
  origin: { type: String },
  notes: { type: String },
  // New fields for real ML training
  pH: { type: Number },
  moisture: { type: Number },
  temperature: { type: Number },
  safe: { type: Number }, // 1 = safe, 0 = unsafe (derived from verdict)
  ts: { type: Date, default: Date.now },
  catCode: { type: Number }
});

module.exports = mongoose.model('Review', reviewSchema);