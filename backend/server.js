// server.js - Carbon Credits Platform (Node.js/Express)
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const crypto = require('crypto');
const { MongoClient, GridFSBucket, ObjectId } = require('mongodb');
const { GridFsStorage } = require('multer-gridfs-storage');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');
const bcrypt = require('bcryptjs');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 5000;

// Configuration
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const DATABASE_NAME = process.env.DATABASE_NAME || 'EcoLedger';

// Initialize MongoDB connection and GridFS
let client, db, gfsBucket;

(async () => {
  try {
    client = new MongoClient(MONGO_URI);
    await client.connect();
    
    db = client.db(DATABASE_NAME);
    console.log('✅ MongoDB connected successfully');
    
    // Initialize GridFS bucket after successful DB connection
    gfsBucket = new GridFSBucket(db, {
      bucketName: 'credits',
      chunkSizeBytes: 1024 * 255
    });

    await db.collection('credits').createIndex({ fileId: 1 });
    await db.collection('credits').createIndex({ userId: 1 });
    await db.collection('credits').createIndex({ status: 1 });
    await db.collection('users').createIndex({ email: 1 }, { unique: true });
    await db.collection('users').createIndex({ userId: 1 }, { unique: true });

    console.log('✅ MongoDB connected successfully with indexes created');
  } catch (err) {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
  }
})();

app.use(cors({ origin: 'http://localhost:5173', credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Custom GridFS upload function
async function uploadToGridFS(file, metadata) {
  return new Promise((resolve, reject) => {
    const filename = crypto.randomBytes(16).toString('hex') + path.extname(file.originalname);
    const uploadStream = gfsBucket.openUploadStream(filename, {
      metadata: {
        ...metadata,
        originalName: file.originalname,
        uploadDate: new Date()
      }
    });

    uploadStream.on('error', (error) => {
      reject(error);
    });

    uploadStream.on('finish', () => {
      resolve({
        id: uploadStream.id,
        filename: filename,
        originalname: file.originalname,
        size: file.size,
        metadata: uploadStream.options.metadata
      });
    });

    uploadStream.end(file.buffer);
  });
}
// Multer setup for memory storage
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Only PDF files are allowed!'), false);
  }
});

const generateUserId = () => 'USER-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 8);
const generateCreditId = () => 'CREDIT-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 8);

// Middleware to validate user
const validateUser = async (req, res, next) => {
  try {
    const email = req.headers['email'];
    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'missing_email',
        message: 'Email header is required'
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

    req.user = user; // Attach user to request
    next();
  } catch (err) {
    console.error('User validation error:', err);
    res.status(500).json({
      success: false,
      error: 'validation_error',
      message: 'User validation failed'
    });
  }
};

// Routes

app.post('/api/auth/signup', async (req, res) => {
  try {
    const { name, email, password, role = 'user' } = req.body;
    if (!email || !password || !name) return res.status(400).json({ success: false, error: 'missing_fields', message: 'Name, email, password, and role are required' });

    const existingUser = await db.collection('users').findOne({ email });
    if (existingUser) return res.status(409).json({ success: false, error: 'user_exists', message: 'User already exists with this email' });

    const userId = generateUserId();
    const hashedPassword = await bcrypt.hash(password, 10);

    await db.collection('users').insertOne({ userId, email, name, password: hashedPassword, role, createdAt: new Date(), updatedAt: new Date(), credits: [] });

    res.status(201).json({ success: true, message: 'User registered successfully', userId });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ success: false, error: 'server_error', message: 'Server error during registration' });
  }
});

app.post('/api/auth/signin', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await db.collection('users').findOne({ email });
    if (!user) return res.status(400).json({ success: false, error: 'invalid_credentials', message: 'Invalid email or password' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ success: false, error: 'invalid_credentials', message: 'Invalid email or password' });

    res.json({ success: true, message: 'Login successful', user: { userId: user.userId, email: user.email, name: user.name, role: user.role } });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, error: 'server_error', message: 'Server error during login' });
  }
});


app.post('/api/credits/upload', validateUser, upload.single('certificate'), async (req, res) => {
  console.log(req.body);
  try {
    const email = req.headers['email'];
    console.log('Upload request received for email:', email);
    const user = await db.collection('users').findOne({ email });
    console.log('User found:', user);
    
    if (!user || !req.file) {
      return res.status(400).json({ 
        success: false, 
        error: 'upload_failed', 
        message: 'Invalid user or no file uploaded' 
      });
    }

    // Upload file to GridFS
    const uploadedFile = await uploadToGridFS(req.file, {
      email,
      userId: user.userId
    });

    const creditId = generateCreditId();
    await db.collection('credits').insertOne({ 
      creditId, 
      fileId: uploadedFile.id, 
      filename: uploadedFile.filename, 
      userId: user.userId, 
      originalName: uploadedFile.originalname, 
      fileSize: uploadedFile.size, 
      uploadDate: new Date(), 
      status: 'pending', 
      metadata: uploadedFile.metadata 
    });
    
    await db.collection('users').updateOne(
      { userId: user.userId }, 
      { $push: { credits: creditId } }
    );

    res.status(201).json({ 
      success: true, 
      message: 'Credit certificate uploaded successfully', 
      creditId, 
      fileId: uploadedFile.id.toString() 
    });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ 
      success: false, 
      error: 'upload_failed', 
      message: 'Failed to upload credit certificate' 
    });
  }
});

app.post('/api/credits/authenticate', async (req, res) => {
  try {
    const email = req.headers['email'];
    const { creditId } = req.body;
    const user = await db.collection('users').findOne({ email });
    const credit = await db.collection('credits').findOne({ creditId, userId: user.userId });

    if (!credit) {
      return res.status(404).json({ 
        success: false, 
        error: 'not_found', 
        message: 'Credit not found or not owned by user' 
      });
    }

    const tempFilePath = path.join(__dirname, 'temp', credit.filename);
    await fs.promises.mkdir(path.dirname(tempFilePath), { recursive: true });

    const downloadStream = gfsBucket.openDownloadStream(credit.fileId);
    const writeStream = fs.createWriteStream(tempFilePath);
    downloadStream.pipe(writeStream);
    
    await new Promise((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
      downloadStream.on('error', reject);
    });

    const form = new FormData();
    form.append('certificate', fs.createReadStream(tempFilePath));
    const flaskRes = await axios.post('http://localhost:5001/api/authenticate', form, { 
      headers: form.getHeaders() 
    });

    const authData = flaskRes.data;
    const updateFields = {
      status: authData.authenticated ? 'authenticated' : 'unauthenticated',
      authenticatedAt: new Date(),
      authResult: authData
    };
    
    if (authData.extracted_data) updateFields.extractedData = authData.extracted_data;
    if (authData.carbonmark_details) updateFields.carbonmarkDetails = authData.carbonmark_details;

    const updateResult = await db.collection('credits').updateOne(
      { creditId, userId: user.userId },
      { $set: updateFields }
    );

    console.log('🔍 Update Result:', updateResult);
    if (updateResult.modifiedCount === 0) {
      return res.status(500).json({ 
        success: false, 
        error: 'update_failed', 
        message: 'Failed to update credit authentication status' 
      });
    }

    await fs.promises.unlink(tempFilePath);

    res.json({ 
      success: true, 
      message: 'Credit authentication completed', 
      creditId, 
      authenticated: authData.authenticated, 
      details: authData 
    });
  } catch (err) {
    console.error('Authentication error:', err);
    res.status(500).json({ 
      success: false, 
      error: 'authentication_failed', 
      message: 'Failed to authenticate credit' 
    });
  }
});

app.get('/api/credits/:fileId/view', async (req, res) => {
  try {
    const fileId = new ObjectId(req.params.fileId);
    const email = req.headers['email'];
    const user = await db.collection('users').findOne({ email });

    const files = await db.collection('credits.files').find({ _id: fileId }).toArray();
    if (!files || files.length === 0) {
      return res.status(404).json({ success: false, error: 'not_found', message: 'File not found' });
    }

    const file = files[0];
    const credit = await db.collection('credits').findOne({ fileId });
    if (!credit || (credit.userId !== user.userId && user.role !== 'admin')) {
      return res.status(403).json({ success: false, error: 'forbidden', message: 'Not authorized to access this file' });
    }

    res.set({
      'Content-Type': file.contentType || 'application/pdf',
      'Content-Disposition': `inline; filename="${file.filename}"`
    });

    const downloadStream = gfsBucket.openDownloadStream(fileId);
    downloadStream.on('error', () => {
      res.status(500).json({ success: false, error: 'stream_error', message: 'Error streaming file' });
    });
    downloadStream.pipe(res);
  } catch (err) {
    console.error('View error:', err);
    res.status(500).json({ success: false, error: 'server_error', message: 'Failed to view file' });
  }
});

// List credit on marketplace
app.post('/api/marketplace/list', async (req, res) => {
  try {
    const { creditId, pricePerCredit, currency = 'USD' } = req.body;
    const email = req.headers['email'];
    const user = await db.collection('users').findOne({ email });

    if (!creditId || !pricePerCredit) {
      return res.status(400).json({ success: false, error: 'missing_fields', message: 'creditId and pricePerCredit are required' });
    }

    const credit = await db.collection('credits').findOne({ creditId, userId: user.userId, status: 'authenticated' });
    if (!credit) {
      return res.status(404).json({ success: false, error: 'invalid_credit', message: 'Credit not found, not authenticated, or not owned by user' });
    }

    const listing = {
      listingId: `LIST-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
      creditId,
      sellerId: user.userId,
      pricePerCredit: parseFloat(pricePerCredit),
      currency,
      amount: credit.extractedData?.amount || 1,
      status: 'listed',
      listedAt: new Date(),
      updatedAt: new Date(),
      creditDetails: {
        serialNumber: credit.extractedData?.serial_number,
        projectId: credit.extractedData?.project_id,
        vintage: credit.extractedData?.vintage,
        registry: credit.extractedData?.registry
      }
    };

    await db.collection('marketplace').insertOne(listing);
    await db.collection('credits').updateOne({ creditId }, { $set: { status: 'listed' } });

    res.status(201).json({ success: true, message: 'Credit listed on marketplace successfully', listingId: listing.listingId });
  } catch (err) {
    console.error('Marketplace listing error:', err);
    res.status(500).json({ success: false, error: 'listing_failed', message: 'Failed to list credit on marketplace' });
  }
});

// Get marketplace listings
app.get('/api/marketplace/listings', async (req, res) => {
  try {
    const { status = 'listed', limit = 20, offset = 0 } = req.query;
    const query = { status };

    const listings = await db.collection('marketplace')
      .find(query)
      .sort({ listedAt: -1 })
      .skip(parseInt(offset))
      .limit(parseInt(limit))
      .toArray();

    const sanitizedListings = listings.map(listing => {
      const sanitized = { ...listing };
      if (sanitized._id) sanitized._id = sanitized._id.toString();
      return sanitized;
    });

    const total = await db.collection('marketplace').countDocuments(query);

    res.json({ success: true, listings: sanitizedListings, total, limit: parseInt(limit), offset: parseInt(offset) });
  } catch (err) {
    console.error('Listings fetch error:', err);
    res.status(500).json({ success: false, error: 'fetch_failed', message: 'Failed to fetch marketplace listings' });
  }
});

// Get user credits
app.get('/api/users/me/credits', async (req, res) => {
  try {
    const email = req.headers['email'];
    const user = await db.collection('users').findOne({ email });
    const credits = await db.collection('credits')
      .find({ userId: user.userId })
      .sort({ uploadDate: -1 })
      .toArray();

    const sanitizedCredits = credits.map(credit => {
      const sanitized = { ...credit };
      if (sanitized._id) sanitized._id = sanitized._id.toString();
      if (sanitized.fileId) sanitized.fileId = sanitized.fileId.toString();
      if (sanitized.uploadDate) sanitized.uploadDate = sanitized.uploadDate.toISOString();
      if (sanitized.authenticatedAt) sanitized.authenticatedAt = sanitized.authenticatedAt.toISOString();
      return sanitized;
    });

    res.json({ success: true, credits: sanitizedCredits });
  } catch (err) {
    console.error('User credits fetch error:', err);
    res.status(500).json({ success: false, error: 'fetch_failed', message: 'Failed to fetch user credits' });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    success: false,
    error: 'server_error',
    message: 'Internal server error'
  });
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  if (client) {
    await client.close();
  }
  process.exit(0);
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});