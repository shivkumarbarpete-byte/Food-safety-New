const mongoose = require('mongoose');

const LabTestSchema = new mongoose.Schema({
  category: {
    type: String,
    required: true,
    index: true
  },
  parameterName: {
    type: String,
    required: true
  },
  standardLimit: {
    type: String,
    required: true
  },
  unit: {
    type: String,
    default: ''
  },
  description: {
    type: String,
    default: ''
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('LabTest', LabTestSchema);