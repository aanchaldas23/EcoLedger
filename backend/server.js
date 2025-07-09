require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { MongoClient, GridFSBucket, ObjectId } = require('mongodb');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');

const app = express();
const PORT = process.env.PORT || 5000;

// MongoDB setup
let client, db, gfsBucket;
(async () => {
  try {
    client = new MongoClient(process.env.MONGO_URI || 'mongodb://localhost:27017');
    await client.connect();
    db = client.db(process.env.DATABASE_NAME || 'EcoLedger');
    gfsBucket = new GridFSBucket(db, { bucketName: 'credits' });
    console.log('✅ MongoDB connected');
  } catch (err) {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
  }
})();

// Middleware
app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());

// User Validation Middleware
const validateUser = async (req, res, next) => {
  const email = req.headers['email'];
  if (!email) return res.status(400).json({ success: false, error: 'email_required' });
  
  const user = await db.collection('users').findOne({ email });
  if (!user) return res.status(404).json({ success: false, error: 'user_not_found' });
  
  req.user = user;
  next();
};

// Routes
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { email, name } = req.body;
    if (!email || !name) {
      return res.status(400).json({ 
        success: false, 
        error: 'missing_fields',
        message: 'Email and name are required'
      });
    }

    const existing = await db.collection('users').findOne({ email });
    if (existing) {
      return res.status(409).json({ 
        success: false, 
        error: 'user_exists',
        message: 'User already exists'
      });
    }

    await db.collection('users').insertOne({
      email,
      name,
      credits: [],
      createdAt: new Date()
    });

    res.status(201).json({ 
      success: true, 
      message: 'User created successfully'
    });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ 
      success: false, 
      error: 'server_error',
      message: 'Internal server error'
    });
  }
});

app.post('/api/auth/signin', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ 
        success: false, 
        error: 'email_required',
        message: 'Email is required'
      });
    }

    const user = await db.collection('users').findOne({ email });
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        error: 'user_not_found',
        message: 'User not found'
      });
    }

    res.json({ 
      success: true,
      user: {
        email: user.email,
        name: user.name,
        credits: user.credits || []
      }
    });
  } catch (err) {
    console.error('Signin error:', err);
    res.status(500).json({ 
      success: false, 
      error: 'server_error',
      message: 'Internal server error'
    });
  }
});

// File Upload with GridFS - Modified section
const storage = multer.memoryStorage();
const upload = multer({ storage });

app.post('/api/credits/upload', validateUser, upload.single('certificate'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        error: 'no_file',
        message: 'No file uploaded'
      });
    }

    // Create a simple FormData with just the buffer
    const form = new FormData();
    form.append('certificate', req.file.buffer, {
      filename: req.file.originalname,
      contentType: req.file.mimetype
    });

    // Add proper content-length header
    const headers = {
      ...form.getHeaders(),
      'Content-Length': form.getLengthSync()
    };

    const flaskRes = await axios.post('http://localhost:5001/api/credits/authenticate', form, { headers });


    const { serial_number } = flaskRes.data.extracted_data;
    if (!serial_number) {
      throw new Error('No serial number extracted');
    }

    // 3. Store in GridFS - Using the same buffer we already have
    const uploadStream = gfsBucket.openUploadStream(`${serial_number}.pdf`, {
      metadata: { 
        userId: req.user._id,
        email: req.user.email
      }
    });
    uploadStream.end(req.file.buffer);

    // 4. Create credit record
    await db.collection('credits').insertOne({
      serialNumber: serial_number,
      fileId: uploadStream.id,
      userId: req.user._id,
      status: 'pending',
      uploadedAt: new Date(),
      extractedData: flaskRes.data.extracted_data
    });

    // 5. Update user's credits list
    await db.collection('users').updateOne(
      { _id: req.user._id },
      { $push: { credits: serial_number } }
    );

    res.status(201).json({ 
      success: true, 
      serialNumber: serial_number,
      message: 'File uploaded successfully'
    });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ 
      success: false, 
      error: 'upload_failed',
      message: err.message || 'File upload failed'
    });
  }
});

// Get user credits
app.get('/api/users/me/credits', validateUser, async (req, res) => {
  try {
    const credits = await db.collection('credits')
      .find({ userId: req.user._id })
      .sort({ uploadedAt: -1 })
      .toArray();

    res.json({ 
      success: true,
      credits: credits.map(credit => ({
        serialNumber: credit.serialNumber,
        status: credit.status,
        uploadedAt: credit.uploadedAt,
        fileId: credit.fileId
      }))
    });
  } catch (err) {
    console.error('Credits fetch error:', err);
    res.status(500).json({ 
      success: false, 
      error: 'fetch_failed',
      message: 'Failed to fetch credits'
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});