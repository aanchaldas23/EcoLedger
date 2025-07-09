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

    // 1. Forward to Flask for authentication (Flask handles the DB insertion)
    const form = new FormData();
    form.append('certificate', req.file.buffer, {
      filename: req.file.originalname,
      contentType: req.file.mimetype
    });

    const headers = {
      ...form.getHeaders(),
      'Content-Length': form.getLengthSync()
    };

    const flaskRes = await axios.post('http://localhost:5001/api/credits/authenticate', form, { headers });

    const { serial_number } = flaskRes.data.extracted_data;
    if (!serial_number) {
      throw new Error('No serial number extracted');
    }

    // 2. Store file in GridFS
    const uploadStream = gfsBucket.openUploadStream(`${serial_number}.pdf`, {
      metadata: { 
        userId: req.user._id,
        email: req.user.email
      }
    });
    uploadStream.end(req.file.buffer);

    // 3. Update Flask's credit record with GridFS file ID (instead of creating new record)
    await db.collection('credits').updateOne(
      { serialNumber: serial_number },
      { 
        $set: {
          fileId: uploadStream.id,
          userId: req.user._id,
          userEmail: req.user.email
        }
      }
    );

    // 4. Update user's credits list
    await db.collection('users').updateOne(
      { _id: req.user._id },
      { $addToSet: { credits: serial_number } } // Use $addToSet to avoid duplicates
    );

    res.status(201).json({ 
      success: true, 
      serialNumber: serial_number,
      message: 'File uploaded successfully',
      authenticationResult: flaskRes.data
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

// Marketplace listing endpoint - Add this to your server.js
app.post('/api/marketplace/list', validateUser, async (req, res) => {
  try {
    const { creditId, pricePerCredit, description } = req.body;
    
    // Validate required fields
    if (!creditId || !pricePerCredit) {
      return res.status(400).json({ 
        success: false, 
        error: 'missing_fields',
        message: 'Credit ID and price per credit are required'
      });
    }

    // Validate price is a positive number
    if (isNaN(pricePerCredit) || pricePerCredit <= 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'invalid_price',
        message: 'Price per credit must be a positive number'
      });
    }

    // Check if credit exists and belongs to the user
    const credit = await db.collection('credits').findOne({ 
      _id: new ObjectId(creditId),
      userId: req.user._id 
    });

    if (!credit) {
      return res.status(404).json({ 
        success: false, 
        error: 'credit_not_found',
        message: 'Credit not found or does not belong to you'
      });
    }

    // Check if credit is already listed
    const existingListing = await db.collection('marketplace_listings').findOne({ 
      creditId: new ObjectId(creditId),
      status: 'active'
    });

    if (existingListing) {
      return res.status(409).json({ 
        success: false, 
        error: 'already_listed',
        message: 'Credit is already listed on the marketplace'
      });
    }

    // Create marketplace listing
    const listing = {
      creditId: new ObjectId(creditId),
      sellerId: req.user._id,
      sellerEmail: req.user.email,
      sellerName: req.user.name,
      serialNumber: credit.serialNumber,
      projectId: credit.projectId,
      projectName: credit.projectName,
      vintage: credit.vintage,
      amount: credit.amount,
      registry: credit.registry,
      category: credit.category,
      pricePerCredit: parseFloat(pricePerCredit),
      totalValue: parseFloat(pricePerCredit) * parseFloat(credit.amount),
      description: description || `Verified carbon credits from ${credit.projectName}`,
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = await db.collection('marketplace_listings').insertOne(listing);

    // Update credit status to 'listed'
    await db.collection('credits').updateOne(
      { _id: new ObjectId(creditId) },
      { 
        $set: { 
          status: 'listed',
          listedAt: new Date(),
          listingId: result.insertedId
        }
      }
    );

    res.status(201).json({ 
      success: true,
      message: 'Credit successfully listed on marketplace',
      listing: {
        id: result.insertedId,
        serialNumber: credit.serialNumber,
        projectId: credit.projectId,
        pricePerCredit: parseFloat(pricePerCredit),
        totalValue: listing.totalValue,
        status: 'active'
      }
    });

  } catch (err) {
    console.error('Marketplace listing error:', err);
    res.status(500).json({ 
      success: false, 
      error: 'listing_failed',
      message: 'Failed to list credit on marketplace'
    });
  }
});

// Get marketplace listings (public endpoint)
app.get('/api/marketplace/listings', async (req, res) => {
  try {
    const { page = 1, limit = 20, category, vintage, minPrice, maxPrice } = req.query;
    
    // Build filter query
    let filter = { status: 'active' };
    
    if (category) filter.category = category;
    if (vintage) filter.vintage = vintage;
    if (minPrice || maxPrice) {
      filter.pricePerCredit = {};
      if (minPrice) filter.pricePerCredit.$gte = parseFloat(minPrice);
      if (maxPrice) filter.pricePerCredit.$lte = parseFloat(maxPrice);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const listings = await db.collection('marketplace_listings')
      .find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .toArray();

    const total = await db.collection('marketplace_listings').countDocuments(filter);

    res.json({
      success: true,
      listings: listings.map(listing => ({
        id: listing._id,
        serialNumber: listing.serialNumber,
        projectId: listing.projectId,
        projectName: listing.projectName,
        vintage: listing.vintage,
        amount: listing.amount,
        registry: listing.registry,
        category: listing.category,
        pricePerCredit: listing.pricePerCredit,
        totalValue: listing.totalValue,
        description: listing.description,
        sellerName: listing.sellerName,
        createdAt: listing.createdAt
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (err) {
    console.error('Marketplace listings fetch error:', err);
    res.status(500).json({ 
      success: false, 
      error: 'fetch_failed',
      message: 'Failed to fetch marketplace listings'
    });
  }
});

// Get user's marketplace listings
app.get('/api/marketplace/my-listings', validateUser, async (req, res) => {
  try {
    const listings = await db.collection('marketplace_listings')
      .find({ sellerId: req.user._id })
      .sort({ createdAt: -1 })
      .toArray();

    res.json({
      success: true,
      listings: listings.map(listing => ({
        id: listing._id,
        serialNumber: listing.serialNumber,
        projectId: listing.projectId,
        projectName: listing.projectName,
        vintage: listing.vintage,
        amount: listing.amount,
        pricePerCredit: listing.pricePerCredit,
        totalValue: listing.totalValue,
        description: listing.description,
        status: listing.status,
        createdAt: listing.createdAt
      }))
    });

  } catch (err) {
    console.error('My listings fetch error:', err);
    res.status(500).json({ 
      success: false, 
      error: 'fetch_failed',
      message: 'Failed to fetch your listings'
    });
  }
});

// Remove listing from marketplace
app.delete('/api/marketplace/listings/:listingId', validateUser, async (req, res) => {
  try {
    const { listingId } = req.params;

    const listing = await db.collection('marketplace_listings').findOne({
      _id: new ObjectId(listingId),
      sellerId: req.user._id
    });

    if (!listing) {
      return res.status(404).json({ 
        success: false, 
        error: 'listing_not_found',
        message: 'Listing not found or does not belong to you'
      });
    }

    // Update listing status to 'removed'
    await db.collection('marketplace_listings').updateOne(
      { _id: new ObjectId(listingId) },
      { 
        $set: { 
          status: 'removed',
          removedAt: new Date()
        }
      }
    );

    // Update credit status back to 'authenticated'
    await db.collection('credits').updateOne(
      { _id: listing.creditId },
      { 
        $set: { status: 'authenticated' },
        $unset: { listedAt: 1, listingId: 1 }
      }
    );

    res.json({ 
      success: true,
      message: 'Listing removed from marketplace'
    });

  } catch (err) {
    console.error('Remove listing error:', err);
    res.status(500).json({ 
      success: false, 
      error: 'remove_failed',
      message: 'Failed to remove listing'
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