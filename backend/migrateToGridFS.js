require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { MongoClient, ObjectId } = require('mongodb');
const { GridFSBucket } = require('mongodb');
const crypto = require('crypto');

const UPLOADS_DIR = path.join(__dirname, 'uploads');
const MONGO_URI = process.env.MONGO_URI;
const DB_NAME = 'greencredits';

async function migrateFiles() {
  const client = await MongoClient.connect(MONGO_URI, { 
    useUnifiedTopology: true 
  });
  const db = client.db(DB_NAME);
  const gfsBucket = new GridFSBucket(db, { bucketName: 'certificates' });

  // Read all files from the uploads directory
  const files = fs.readdirSync(UPLOADS_DIR).filter(file => {
    return fs.statSync(path.join(UPLOADS_DIR, file)).isFile();
  });

  console.log(`Found ${files.length} files to migrate...`);

  for (const file of files) {
    const filePath = path.join(UPLOADS_DIR, file);
    const fileBuffer = fs.readFileSync(filePath);
    const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

    try {
      // Check if file already exists in GridFS (by hash)
      const existingFile = await db.collection('certificates.files').findOne({
        'metadata.hash': hash
      });

      if (existingFile) {
        console.log(`Skipping duplicate: ${file}`);
        fs.unlinkSync(filePath); // Delete the local file
        continue;
      }

      // Create a write stream to GridFS
      const uploadStream = gfsBucket.openUploadStream(file, {
        metadata: {
          originalName: file,
          hash,
          migratedAt: new Date()
        }
      });

      // Pipe the file data to GridFS
      const readStream = fs.createReadStream(filePath);
      await new Promise((resolve, reject) => {
        readStream.pipe(uploadStream)
          .on('error', reject)
          .on('finish', resolve);
      });

      console.log(`Migrated: ${file} (ID: ${uploadStream.id})`);
      fs.unlinkSync(filePath); // Delete the local file after migration

    } catch (err) {
      console.error(`Error migrating ${file}:`, err.message);
    }
  }

  console.log('Migration complete!');
  await client.close();
}

migrateFiles().catch(console.error);