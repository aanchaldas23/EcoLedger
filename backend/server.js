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

//const enrollAdmin = require('./wallet/enrollAdmin.js');
//const enrollUser = require('./wallet/enrollUser.js');
//const { submitTransaction } = require('../fabric/doc_functions');


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

// Admin emails from .env
const ADMIN_EMAILS = process.env.ADMIN_EMAILS ? process.env.ADMIN_EMAILS.split(',') : [];

// User Validation Middleware
const validateUser = async (req, res, next) => {
  const email = req.headers['email'];
  if (!email) return res.status(400).json({ success: false, error: 'email_required' });
  
  const user = await db.collection('users').findOne({ email });
  if (!user) return res.status(404).json({ success: false, error: 'user_not_found' });

  // Add this debug log
  console.log('Comparing:', email, 'with admin list:', ADMIN_EMAILS);
  
  // Case-sensitive comparison (change to .toLowerCase() if needed)
  req.isAdmin = ADMIN_EMAILS.includes(email);
  req.user = user;
  
  // Debug log
  console.log('Is admin?', req.isAdmin);
  
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
  let uploadStream;
  let mongoSuccess = false;
  let blockchainSuccess = false;
  let serial_number;

  try {
    // 1. Validate file
    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        error: 'no_file',
        message: 'No file uploaded' 
      });
    }

    // 2. Authenticate with Flask
    const form = new FormData();
    form.append('certificate', req.file.buffer, {
      filename: req.file.originalname,
      contentType: req.file.mimetype
    });

    const flaskRes = await axios.post(
      'http://localhost:5001/api/credits/authenticate', 
      form, 
      { headers: form.getHeaders() }
    );

    serial_number = flaskRes.data.extracted_data.serial_number;
    if (!serial_number) throw new Error('No serial number extracted');

    // 3. Store in GridFS (UNCONDITIONAL)
    uploadStream = gfsBucket.openUploadStream(`${serial_number}.pdf`, {
      metadata: { 
        userId: req.user._id,
        email: req.user.email
      }
    });
    uploadStream.end(req.file.buffer);
    mongoSuccess = true;

    // 4. Prepare blockchain data
    const blockchainCert = {
      serialNumber: serial_number,
      projectId: flaskRes.data.extracted_data.project_id,
      projectName: flaskRes.data.extracted_data.project_name,
      vintage: flaskRes.data.extracted_data.vintage,
      amount: flaskRes.data.extracted_data.amount,
      registry: flaskRes.data.carbonmark_details?.name || 'Unknown',
      category: flaskRes.data.extracted_data.category,
      owner: req.user.email,
      fileHash: crypto.createHash('sha256').update(req.file.buffer).digest('hex')
    };

    // 5. Attempt blockchain storage (but don't fail overall if this fails)
    try {
      await submitTransaction('CreateCertificate',
        blockchainCert.serialNumber,
        blockchainCert.projectId,
        blockchainCert.projectName,
        blockchainCert.vintage,
        blockchainCert.amount.toString(),
        blockchainCert.registry,
        blockchainCert.category,
        blockchainCert.owner,
        blockchainCert.fileHash
      );
      blockchainSuccess = true;
    } catch (blockchainErr) {
      console.error('Blockchain storage failed (non-critical):', blockchainErr);
    }

    // 6. Update MongoDB
    await db.collection('credits').updateOne(
      { serialNumber: serial_number },
      { 
        $set: {
          fileId: uploadStream.id,
          userId: req.user._id,
          userEmail: req.user.email,
          ...(blockchainSuccess && { 
            blockchainId: serial_number,
            blockchainStatus: 'minted' 
          })
        }
      },
      { upsert: true }
    );

    // 7. Update user's credits list
    await db.collection('users').updateOne(
      { _id: req.user._id },
      { $addToSet: { credits: serial_number } }
    );

    // 8. Return response indicating what succeeded
    res.status(201).json({
      success: true,
      serialNumber: serial_number,
      message: 'Certificate processed',
      storageStatus: {
        mongo: 'success',
        blockchain: blockchainSuccess ? 'success' : 'failed',
        ...(!blockchainSuccess && { 
          blockchainError: 'Certificate stored in MongoDB but not on blockchain' 
        })
      },
      data: {
        mongoId: uploadStream.id,
        ...(blockchainSuccess && { blockchainTx: serial_number }),
        authentication: flaskRes.data
      }
    });

  } catch (err) {
    console.error('Upload processing error:', err);
    
    // Only clean up GridFS if upload failed before completion
    if (uploadStream?.id && !mongoSuccess) {
      await gfsBucket.delete(uploadStream.id).catch(console.error);
    }

    res.status(500).json({
      success: false,
      error: 'processing_error',
      message: err.message,
      storageStatus: {
        mongo: mongoSuccess ? 'success' : 'failed',
        blockchain: blockchainSuccess ? 'success' : 'not_attempted'
      }
    });
  }
});

// Marketplace listing endpoint
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

// ====================== BLOCKCHAIN ROUTES ======================

// Mint credit on blockchain
app.post('/api/blockchain/mint', validateUser, async (req, res) => {
  try {
    const { creditId } = req.body;
    
    // Validate credit exists and belongs to user
    const credit = await db.collection('credits').findOne({ 
      _id: new ObjectId(creditId),
      userId: req.user._id 
    });

    if (!credit) {
      return res.status(404).json({ success: false, error: 'credit_not_found' });
    }

    if (credit.blockchainId) {
      return res.status(400).json({ success: false, error: 'already_minted' });
    }

    // In a real app, you would call your blockchain service here
    // For demo purposes, we'll simulate a response
    const blockchainResponse = {
      transactionHash: `0x${crypto.randomBytes(32).toString('hex')}`,
      tokenId: Math.floor(Math.random() * 1000000),
      blockNumber: Math.floor(Math.random() * 10000)
    };

    // Update credit with blockchain info
    await db.collection('credits').updateOne(
      { _id: new ObjectId(creditId) },
      { 
        $set: { 
          blockchainId: blockchainResponse.tokenId,
          transactionHash: blockchainResponse.transactionHash,
          blockNumber: blockchainResponse.blockNumber,
          mintedAt: new Date(),
          status: 'minted',
          blockchainStatus: 'minted'
        }
      }
    );

    res.json({ 
      success: true,
      message: 'Credit minted on blockchain',
      blockchainResponse
    });
  } catch (err) {
    console.error('Blockchain mint error:', err);
    res.status(500).json({ success: false, error: 'mint_failed' });
  }
});

// Get blockchain transaction status
app.get('/api/blockchain/transaction/:txHash', async (req, res) => {
  try {
    const { txHash } = req.params;
    
    // In a real app, you would query your blockchain node here
    // For demo, return mock data
    res.json({
      success: true,
      status: 'confirmed',
      blockNumber: Math.floor(Math.random() * 10000),
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('Transaction status error:', err);
    res.status(500).json({ success: false, error: 'status_check_failed' });
  }
});

// Admin enrollment endpoint
app.post('/api/enroll/admin', async (req, res) => {
    try {
        await enrollAdmin();
        res.json({ success: true, message: 'Admin enrolled successfully' });
    } catch (err) {
        console.error('Admin enrollment error:', err);
        res.status(500).json({ 
            success: false, 
            error: 'admin_enrollment_failed',
            details: err.message 
        });
    }
});

// User enrollment endpoint
app.post('/api/enroll/user', validateUser, async (req, res) => {
    try {
        await enrollUser(req.user.email);
        res.json({ success: true, message: 'User enrolled successfully' });
    } catch (err) {
        console.error('User enrollment error:', err);
        res.status(500).json({ 
            success: false, 
            error: 'user_enrollment_failed',
            details: err.message 
        });
    }
});

// ====================== ADMIN ROUTES ======================

// Check if user is admin
app.get('/api/admin/check', validateUser, async (req, res) => {
  console.log('Checking admin access for:', req.user.email);
  console.log('Admin emails:', ADMIN_EMAILS);
  res.json({ 
    success: true,
    isAdmin: req.isAdmin,
    email: req.user.email,
    adminEmails: ADMIN_EMAILS
  });
});

// Admin dashboard stats
app.get('/api/admin/stats', validateUser, async (req, res) => {
  if (!req.isAdmin) {
    return res.status(403).json({ success: false, error: 'admin_required' });
  }

  try {
    const [usersCount, creditsCount, activeListings] = await Promise.all([
      db.collection('users').countDocuments(),
      db.collection('credits').countDocuments(),
      db.collection('marketplace_listings').countDocuments({ status: 'active' })
    ]);

    res.json({ 
      success: true,
      stats: { usersCount, creditsCount, activeListings }
    });
  } catch (err) {
    console.error('Admin stats error:', err);
    res.status(500).json({ success: false, error: 'stats_failed' });
  }
});

// Get all users (admin only)
app.get('/api/admin/users', validateUser, async (req, res) => {
  if (!req.isAdmin) {
    return res.status(403).json({ success: false, error: 'admin_required' });
  }

  try {
    const users = await db.collection('users').find().toArray();
    res.json({ 
      success: true,
      users: users.map(user => ({
        id: user._id,
        email: user.email,
        name: user.name,
        creditsCount: user.credits?.length || 0,
        createdAt: user.createdAt
      }))
    });
  } catch (err) {
    console.error('Admin users error:', err);
    res.status(500).json({ success: false, error: 'users_fetch_failed' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});