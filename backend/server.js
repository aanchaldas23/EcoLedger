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
    // MODIFIED: Added sparse: true to allow documents without serialNumber
    await db.collection('credits').createIndex({ serialNumber: 1 }, { unique: true, sparse: true }); 
    await db.collection('users').createIndex({ email: 1 }, { unique: true });
    await db.collection('users').createIndex({ userId: 1 }, { unique: true });

    console.log('✅ MongoDB connected successfully with indexes created');
  } catch (err) {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
  }
})();

app.use(cors({
  origin: 'http://localhost:5173',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'email', 'Email'], // Allow both cases
  credentials: true,
  optionsSuccessStatus: 204
}));
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
      console.error('GridFS upload stream error:', error);
      reject(error);
    });

    uploadStream.on('finish', () => {
      console.log(`GridFS upload finished for file: ${filename}, ID: ${uploadStream.id}`);
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
// Multer setup for memory storage - file is stored in req.file.buffer
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

// Middleware to validate user
const validateUser = async (req, res, next) => {
  try {
    const email = req.headers['email'];
    if (!email) {
      console.warn('Validation Error: Missing email header');
      return res.status(400).json({
        success: false,
        error: 'missing_email',
        message: 'Email header is required'
      });
    }

    const user = await db.collection('users').findOne({ email });
    if (!user) {
      console.warn(`Validation Error: User not found for email: ${email}`);
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
app.get('/', (req, res) => {
  res.json({
    message: 'Carbon Credits Platform API',
    status: 'running',
    version: '1.0'
  });
});

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
  console.log('--- /api/credits/upload START ---');
  try {
    const email = req.headers['email'];
    console.log('Upload request received for email:', email);
    const user = req.user; // User is already validated and attached by validateUser middleware
    console.log('User found:', user.userId);
    
    if (!req.file) {
      console.error('Upload Error: No file provided in request.');
      return res.status(400).json({ 
        success: false, 
        error: 'upload_failed', 
        message: 'No file uploaded' 
      });
    }

    const originalname = req.file.originalname;
    const fileBuffer = req.file.buffer;

    console.log('Step 1: Creating temporary file for Flask processing...');
    // Create a temporary file from the buffer to send to Flask
    const tempFileName = crypto.randomBytes(16).toString('hex') + path.extname(originalname);
    const tempFilePath = path.join(__dirname, 'temp', tempFileName);
    await fs.promises.mkdir(path.dirname(tempFilePath), { recursive: true });
    await fs.promises.writeFile(tempFilePath, fileBuffer);
    console.log(`Temp file created at: ${tempFilePath}`);

    console.log('Step 2: Sending temporary file to Flask for initial data extraction...');
    const form = new FormData();
    form.append('certificate', fs.createReadStream(tempFilePath));
    
    let flaskInitialParseResponse;
    try {
      // Flask's /authenticate endpoint is used for initial parsing and full auth
      // It will return extracted_data including serial_number
      flaskInitialParseResponse = await axios.post('http://localhost:5001/api/credits/authenticate', form, { 
        headers: form.getHeaders() 
      });
      console.log('Flask initial parse response status:', flaskInitialParseResponse.status);
    } catch (flaskError) {
      console.error('Error calling Flask API for initial parsing:', flaskError.message);
      if (flaskError.response) {
        console.error('Flask response data (initial parse):', flaskError.response.data);
        console.error('Flask response status (initial parse):', flaskError.response.status);
      }
      await fs.promises.unlink(tempFilePath); // Clean up temp file
      return res.status(500).json({
        success: false,
        error: 'flask_initial_parsing_failed',
        message: `Flask initial parsing failed: ${flaskError.message}. Check Flask server logs.`,
        flask_details: flaskError.response ? flaskError.response.data : null
      });
    }
    
    const flaskInitialParseData = flaskInitialParseResponse.data;
    console.log('Flask initial parse data received:', JSON.stringify(flaskInitialParseData, null, 2));
    await fs.promises.unlink(tempFilePath); // Clean up temp file after Flask has processed it

    if (!flaskInitialParseData.success || !flaskInitialParseData.extracted_data || !flaskInitialParseData.extracted_data.serial_number) {
        console.error('Upload Error: Serial number not extracted during initial Flask parsing.');
        return res.status(400).json({
            success: false,
            error: 'extraction_failed',
            message: 'Could not extract serial number from certificate during initial processing.'
        });
    }
    const serialNumber = flaskInitialParseData.extracted_data.serial_number;
    console.log(`Extracted Serial Number: ${serialNumber}`);

    console.log('Step 3: Checking for duplicate serial number in MongoDB...');
    const existingCredit = await db.collection('credits').findOne({ serialNumber });
    if (existingCredit) {
      console.warn(`Duplicate Error: Credit with serial number ${serialNumber} already exists.`);
      return res.status(409).json({
        success: false,
        error: 'duplicate_serial_number',
        message: 'A credit with this serial number has already been uploaded.',
        serialNumber: existingCredit.serialNumber,
        fileId: existingCredit.fileId ? existingCredit.fileId.toString() : null 
      });
    }

    console.log('Step 4: No duplicate found. Uploading file to GridFS and inserting initial credit document...');
    // Only upload to GridFS if it's not a duplicate
    const uploadedFile = await uploadToGridFS(req.file, { // Use req.file here as it's still in memory
      email,
      userId: user.userId
    });
    console.log(`GridFS upload successful. File ID: ${uploadedFile.id}, Filename: ${uploadedFile.filename}`);

    // Insert initial credit document with pending status
    const insertResult = await db.collection('credits').insertOne({ 
      serialNumber: serialNumber,
      fileId: uploadedFile.id, 
      filename: uploadedFile.filename, 
      userId: user.userId, 
      originalName: uploadedFile.originalname, 
      fileSize: uploadedFile.size, 
      uploadDate: new Date(), 
      status: 'pending', // Initial status is pending
      metadata: uploadedFile.metadata,
      extractedData: flaskInitialParseData.extracted_data // Store extracted data from Flask immediately
    });
    console.log('Credit document inserted with _id:', insertResult.insertedId);
    
    console.log('Step 5: Updating user document with new credit serial number...');
    await db.collection('users').updateOne(
      { userId: user.userId }, 
      { $push: { credits: serialNumber } }
    );
    console.log(`User ${user.userId} updated with serial number ${serialNumber}.`);

    console.log('Step 6: Initiating full authentication with Flask (asynchronous)...');
    // Now, send the file for full authentication to Flask.
    // This can be done asynchronously as the credit is already stored.
    // The Flask endpoint will update the credit status in the DB.
    axios.post('http://localhost:5001/api/credits/authenticate', form, { // Re-create form data if needed, or pass serialNumber
      headers: form.getHeaders() 
    }).then(response => {
      console.log('Asynchronous Flask full authentication response:', response.data);
      // No need to handle response here, Flask updates DB directly.
    }).catch(error => {
      console.error('Asynchronous Flask full authentication failed:', error.message);
      // Log error, but don't block the response to the frontend
    });

    res.status(201).json({ 
      success: true, 
      message: 'Credit certificate uploaded and processing initiated.', 
      serialNumber: serialNumber,
      fileId: uploadedFile.id.toString() 
    });
    console.log('--- /api/credits/upload END (Success) ---');
  } catch (err) {
    console.error('--- /api/credits/upload END (Error) ---');
    console.error('Upload endpoint caught an error:', err);
    res.status(500).json({ 
      success: false, 
      error: 'upload_failed', 
      message: 'Failed to upload credit certificate',
      details: err.message 
    });
  }
});

app.post('/api/credits/authenticate', async (req, res) => {
  console.log('--- /api/credits/authenticate START ---');
  try {
    const email = req.headers['email'];
    const { serialNumber } = req.body;
    console.log(`[Auth Endpoint] Received request for serialNumber: ${serialNumber} by email: ${email}`);
    const user = await db.collection('users').findOne({ email });
    console.log(`[Auth Endpoint] User found: ${user ? user.userId : 'None'}`);
    const credit = await db.collection('credits').findOne({ serialNumber, userId: user.userId });

    if (!credit) {
      console.warn(`[Auth Endpoint] Credit not found for serialNumber: ${serialNumber} or not owned by user ${user?.userId}`);
      return res.status(404).json({ 
        success: false, 
        error: 'not_found', 
        message: 'Credit not found or not owned by user' 
      });
    }
    console.log(`[Auth Endpoint] Credit found: ${credit.serialNumber}, File ID: ${credit.fileId}`);

    const tempFilePath = path.join(__dirname, 'temp', credit.filename);
    await fs.promises.mkdir(path.dirname(tempFilePath), { recursive: true });
    console.log(`[Auth Endpoint] Created temp directory: ${path.dirname(tempFilePath)}`);

    console.log(`[Auth Endpoint] Downloading file ${credit.fileId} from GridFS...`);
    const downloadStream = gfsBucket.openDownloadStream(credit.fileId);
    const writeStream = fs.createWriteStream(tempFilePath);
    downloadStream.pipe(writeStream);
    
    await new Promise((resolve, reject) => {
      writeStream.on('finish', () => {
        console.log(`[Auth Endpoint] Temp file written: ${tempFilePath}`);
        resolve();
      });
      writeStream.on('error', (err) => {
        console.error(`[Auth Endpoint] Error writing temp file: ${err.message}`);
        reject(err);
      });
      downloadStream.on('error', (err) => {
        console.error(`[Auth Endpoint] Error downloading from GridFS: ${err.message}`);
        reject(err);
      });
    });

    console.log('[Auth Endpoint] Sending temp file to Flask for re-authentication...');
    const form = new FormData();
    form.append('certificate', fs.createReadStream(tempFilePath));
    let flaskRes;
    try {
      flaskRes = await axios.post('http://localhost:5001/api/credits/authenticate', form, { 
        headers: form.getHeaders() 
      });
      console.log("[Auth Endpoint] Response from Flask status:", flaskRes.status);
    } catch (flaskError) {
      console.error('[Auth Endpoint] Error calling Flask API for re-authentication:', flaskError.message);
      if (flaskError.response) {
        console.error('[Auth Endpoint] Flask response data (re-auth):', flaskError.response.data);
        console.error('[Auth Endpoint] Flask response status (re-auth):', flaskError.response.status);
      }
      await fs.promises.unlink(tempFilePath);
      return res.status(500).json({
        success: false,
        error: 'flask_reauthentication_failed',
        message: `Flask re-authentication failed: ${flaskError.message}. Check Flask server logs.`,
        flask_details: flaskError.response ? flaskError.response.data : null
      });
    }

    const authData = flaskRes.data;
    console.log("[Auth Endpoint] Response from Flask (authData):", JSON.stringify(authData, null, 2));
    const status = authData.authenticated ? 'authenticated' : 'unauthenticated';
    console.log(`[Auth Endpoint] Determined status: ${status}`);
    
    const updateFields = {
      status: status,
      authenticatedAt: new Date(),
      authResult: authData
    };
    
    if (authData.extracted_data) updateFields.extractedData = authData.extracted_data;
    if (authData.carbonmark_details) updateFields.carbonmarkDetails = authData.carbonmark_details;

    console.log(`[Auth Endpoint] Updating credit ${serialNumber} in MongoDB...`);
    const updateResult = await db.collection('credits').updateOne(
      { serialNumber, userId: user.userId }, // Update by serialNumber
      { $set: updateFields }
    );
    console.log("[Auth Endpoint] MongoDB update result:", updateResult);

    if (updateResult.modifiedCount === 0) {
      console.warn(`[Auth Endpoint] Update failed: No credit modified for serialNumber: ${serialNumber}.`);
      return res.status(500).json({ 
        success: false, 
        error: 'update_failed', 
        message: 'Failed to update credit authentication status' 
      });
    }
    await fs.promises.unlink(tempFilePath);
    console.log(`[Auth Endpoint] Temp file deleted: ${tempFilePath}`);

    res.json({ 
      success: true, 
      message: 'Credit authentication completed', 
      serialNumber: serialNumber, // Return serialNumber
      authenticated: authData.authenticated, 
      details: authData 
    });
    console.log('--- /api/credits/authenticate END (Success) ---');
  } catch (err) {
    console.error('--- /api/credits/authenticate END (Error) ---');
    console.error('Authentication error:', err);
    res.status(500).json({ 
      success: false, 
      error: 'authentication_failed', 
      message: 'Failed to authenticate credit',
      details: err.message
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
    // Find credit by fileId, which is linked to the serial number
    const credit = await db.collection('credits').findOne({ fileId }); 
    if (!credit || (credit.userId !== user.userId && user.role !== 'admin')) {
      return res.status(403).json({ success: false, error: 'forbidden', message: 'Not authorized to access this file' });
    }

    res.set({
      'Content-Type': file.contentType || 'application/pdf',
      'Content-Disposition': `inline; filename="${file.filename}"`
    });

    const downloadStream = gfsBucket.openDownloadStream(fileId);
    downloadStream.on('error', (err) => {
      console.error('Error streaming file from GridFS:', err);
      res.status(500).json({ success: false, error: 'stream_error', message: 'Error streaming file' });
    });
    downloadStream.pipe(res);
  } catch (err) {
    console.error('View error:', err);
    res.status(500).json({ success: false, error: 'server_error', message: 'Failed to view file' });
  }
});

// List credit on marketplace
app.post('/api/marketplace/list', validateUser, async (req, res) => {
  console.log('--- /api/marketplace/list START ---');
  try {
    const { serialNumber, pricePerCredit, description } = req.body;
    const email = req.headers['email'];
    const user = req.user; // User is already validated and attached by validateUser middleware

    if (!serialNumber || !pricePerCredit) {
      console.warn('Marketplace Listing Error: Missing serialNumber or pricePerCredit.');
      return res.status(400).json({ 
        success: false, 
        error: 'missing_fields', 
        message: 'serialNumber and pricePerCredit are required' 
      });
    }
    console.log(`Listing request for serialNumber: ${serialNumber}, price: ${pricePerCredit}`);

    // Verify the credit exists and is authenticated
    const credit = await db.collection('credits').findOne({ 
      serialNumber, // Find by serialNumber
      userId: user.userId,
      status: 'authenticated'
    });

    if (!credit) {
      console.warn('Marketplace Listing Error: Credit not found, not authenticated, or not owned.');
      return res.status(404).json({ 
        success: false, 
        error: 'invalid_credit', 
        message: 'Credit not found, not authenticated, or not owned by user' 
      });
    }
    console.log(`Credit ${serialNumber} found and is authenticated. Proceeding to list.`);

    // Create marketplace listing
    const listing = {
      listingId: `LIST-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
      serialNumber, // Use serialNumber
      sellerId: user.userId,
      pricePerCredit: parseFloat(pricePerCredit),
      currency: 'USD',
      amount: credit.extractedData?.amount || 1,
      description: description || `Carbon credits from ${credit.extractedData?.project_name}`,
      status: 'listed',
      listedAt: new Date(),
      creditDetails: {
        projectId: credit.extractedData?.project_id,
        projectName: credit.extractedData?.project_name,
        vintage: credit.extractedData?.vintage,
        registry: credit.extractedData?.registry,
        serialNumber: credit.extractedData?.serial_number
      }
    };

    console.log('Inserting new marketplace listing...');
    // Insert into marketplace collection
    await db.collection('marketplace').insertOne(listing);
    console.log(`Marketplace listing created for serialNumber: ${serialNumber}`);
    
    console.log(`Updating credit status to 'listed' for serialNumber: ${serialNumber}...`);
    // Update credit status to 'listed'
    await db.collection('credits').updateOne(
      { serialNumber }, // Update by serialNumber
      { $set: { status: 'listed' } }
    );
    console.log(`Credit ${serialNumber} status updated to 'listed'.`);

    res.status(201).json({ 
      success: true, 
      message: 'Credit listed on marketplace successfully', 
      listing 
    });
    console.log('--- /api/marketplace/list END (Success) ---');
  } catch (err) {
    console.error('--- /api/marketplace/list END (Error) ---');
    console.error('Marketplace listing error:', err);
    res.status(500).json({ 
      success: false, 
      error: 'listing_failed', 
      message: 'Failed to list credit on marketplace',
      details: err.message
    });
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

// Header normalization middleware
app.use((req, _, next) => {  // `_` for unused `res` (ESLint-friendly)
  // Normalize email header (case-insensitive)
  const emailHeader = req.headers['email'] || req.headers['Email'];
  if (emailHeader) {
    req.headers['email'] = emailHeader.trim();
    delete req.headers['Email'];  // Remove uppercase variant if it exists
  }
  return next();  // Explicit return for clarity
});

// Error handling middleware
app.use((err, _, res, __) => {  // `_` and `__` for unused `req` and `next`
  console.error('Server error:', err);
  return res.status(500).json({  // Explicit return
    success: false,
    error: 'server_error',
    message: 'Internal server error'
  });
});

// Get user credits endpoint
app.get('/api/users/me/credits', async (req, res) => {
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

    const credits = await db.collection('credits')
      .find({ userId: user.userId })
      .sort({ uploadDate: -1 })
      .toArray();

    // MODIFIED: Include marketplace-specific fields if they exist
    const response = credits.map(credit => ({
      serialNumber: credit.serialNumber, // Changed from creditId
      status: credit.status,
      uploadDate: credit.uploadDate?.toISOString(),
      extractedData: credit.extractedData || {},
      fileId: credit.fileId?.toString(),
      filename: credit.filename,
      // Include these fields if they are present on the credit document
      pricePerCredit: credit.pricePerCredit || null,
      listingDescription: credit.listingDescription || null,
      totalValue: credit.totalValue || null,
      listedDate: credit.listedDate?.toISOString() || null,
      blockchainStatus: credit.blockchainStatus || null,
      fabricTxId: credit.fabricTxId || null
    }));

    return res.json({ success: true, credits: response });
  } catch (err) {
    console.error('User credits fetch error:', err);
    return res.status(500).json({
      success: false,
      error: 'fetch_failed',
      message: 'Failed to fetch user credits'
    });
  }
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  if (client) {
    await client.close();
  }
  process.exit(0);
});

// NEW ADMIN ENDPOINT: Delete all credits for development/testing
app.delete('/api/admin/clear-credits', async (req, res) => {
  console.log('--- /api/admin/clear-credits START ---');
  try {
    // WARNING: This endpoint is for development/testing ONLY.
    // It will delete ALL documents in the 'credits' collection,
    // ALL files in the 'credits.files' GridFS bucket,
    // and clear 'credits' array in 'users' collection.

    console.log('Deleting all documents from "credits" collection...');
    const deleteCreditsResult = await db.collection('credits').deleteMany({});
    console.log(`Deleted ${deleteCreditsResult.deletedCount} credit documents.`);

    console.log('Deleting all files from "credits.files" GridFS bucket...');
    // Drop the entire GridFS bucket (files and chunks)
    await gfsBucket.drop();
    // Re-initialize the bucket after dropping it
    gfsBucket = new GridFSBucket(db, {
      bucketName: 'credits',
      chunkSizeBytes: 1024 * 255
    });
    console.log('GridFS bucket "credits" dropped and re-initialized.');

    console.log('Clearing "credits" array for all users in "users" collection...');
    const updateUsersResult = await db.collection('users').updateMany(
      {},
      { $set: { credits: [] } }
    );
    console.log(`Cleared credits array for ${updateUsersResult.modifiedCount} users.`);

    res.json({
      success: true,
      message: 'All credit data (documents, files, and user references) cleared successfully.',
      deletedCreditsCount: deleteCreditsResult.deletedCount,
      updatedUsersCount: updateUsersResult.modifiedCount
    });
    console.log('--- /api/admin/clear-credits END (Success) ---');
  } catch (err) {
    console.error('--- /api/admin/clear-credits END (Error) ---');
    console.error('Error clearing credits:', err);
    res.status(500).json({
      success: false,
      error: 'clear_failed',
      message: 'Failed to clear all credit data.',
      details: err.message
    });
  }
});


// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
