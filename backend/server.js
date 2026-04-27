import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import { 
  S3Client, 
  PutObjectCommand, 
  GetObjectCommand, 
  ListObjectsV2Command,
  DeleteObjectCommand 
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const app = express();
app.use(cors());
app.use(express.json());

// 📡 Radar: Log every incoming request
app.use((req, res, next) => {
  console.log(`[NETWORK] ${req.method} request made to: ${req.url}`);
  next();
});

// Initialize S3 Client
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// Connect to MongoDB Atlas
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ Connected to MongoDB Atlas"))
  .catch((error) => console.error("❌ Error connecting to MongoDB:", error));

// ==========================================
// 🌟 MONGODB SCHEMA SETUP (UPDATED FOR AUTH)
// ==========================================
const imageSchema = new mongoose.Schema({
  fileName: { type: String, required: true },
  filterUsed: { type: String, required: true },
  userId: { type: String, required: true }, // Ties the image to the Clerk User
  uploadDate: { type: Date, default: Date.now }
});

const ImageRecord = mongoose.model('Image', imageSchema);
// ==========================================

// ROUTE 1: Get a pre-signed URL to UPLOAD a file (RAW bucket)
// ROUTE 1: Get a pre-signed URL to UPLOAD a file (RAW bucket)
app.post('/api/upload-url', async (req, res) => {
  try {
    // 👈 NEW: Accept edits from the frontend
    const { fileName, fileType, edits } = req.body; 
    
    const command = new PutObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: fileName,
      ContentType: fileType,
      // 🌟 NEW: Attach the editing instructions as S3 Metadata
      Metadata: {
        width: edits?.width ? edits.width.toString() : "0",
        rotation: edits?.rotation ? edits.rotation.toString() : "0",
        watermark: edits?.watermark || "none"
      }
    });

    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 60 });
    res.json({ uploadUrl, fileName });
  } catch (error) {
    console.error("Error generating upload URL:", error);
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

// ROUTE 2: Fetch processed images for a SPECIFIC USER
app.get('/api/images', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 8;
    const skip = (page - 1) * limit;
    const userId = req.query.userId;

    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }

    // Only count and find documents that belong to this user
    const totalImages = await ImageRecord.countDocuments({ userId: userId }); 
    const dbImages = await ImageRecord.find({ userId: userId })
      .sort({ uploadDate: -1 })
      .skip(skip)
      .limit(limit);

    const imagesWithUrls = await Promise.all(
      dbImages.map(async (record) => {
        const command = new GetObjectCommand({
          Bucket: process.env.AWS_PROCESSED_BUCKET_NAME,
          Key: record.fileName,
        });
        
        const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
        
        return {
          key: record.fileName,
          url: url,
          filterUsed: record.filterUsed,
          uploadDate: record.uploadDate
        };
      })
    );

    res.status(200).json({
      images: imagesWithUrls,
      hasMore: skip + dbImages.length < totalImages
    });
  } catch (error) {
    console.error("Error fetching images:", error);
    res.status(500).json({ error: "Failed to fetch images" });
  }
});

// ROUTE 3: DELETE an image
app.delete('/api/images/:fileName', async (req, res) => {
  try {
    const fileName = req.params.fileName;
    
    const command = new DeleteObjectCommand({
      Bucket: process.env.AWS_PROCESSED_BUCKET_NAME,
      Key: fileName,
    });

    await s3Client.send(command);
    await ImageRecord.deleteOne({ fileName: fileName });

    console.log(`🗑️ Deleted ${fileName} from S3 and MongoDB`);
    res.status(200).json({ message: "Image deleted successfully from S3 and DB" });
  } catch (error) {
    console.error("Error deleting image:", error);
    res.status(500).json({ error: "Failed to delete image" });
  }
});

// ROUTE 4: Save image metadata WITH USER ID
app.post('/api/images/metadata', async (req, res) => {
  try {
    const { fileName, filterUsed, userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: "User ID is required to save metadata" });
    }

    const newRecord = new ImageRecord({
      fileName: fileName,
      filterUsed: filterUsed,
      userId: userId // Save the Clerk user ID
    });

    await newRecord.save();
    console.log(`💾 Saved metadata for ${fileName} to MongoDB`);
    
    res.status(201).json(newRecord);
  } catch (error) {
    console.error("Error saving to MongoDB:", error);
    res.status(500).json({ error: "Failed to save to database" });
  }
});

// ROUTE 5: Clean up the RAW bucket
app.delete('/api/clean-raw', async (req, res) => {
  try {
    const listCommand = new ListObjectsV2Command({
      Bucket: process.env.AWS_BUCKET_NAME,
    });
    
    const s3Response = await s3Client.send(listCommand);

    if (!s3Response.Contents || s3Response.Contents.length === 0) {
      return res.status(200).json({ message: "Raw bucket is already empty" });
    }

    await Promise.all(
      s3Response.Contents.map(async (file) => {
        const deleteCommand = new DeleteObjectCommand({
          Bucket: process.env.AWS_BUCKET_NAME,
          Key: file.Key,
        });
        return s3Client.send(deleteCommand);
      })
    );

    console.log(`🗑️ Successfully cleaned all files from the raw bucket`);
    res.status(200).json({ message: "Raw bucket cleaned successfully" });
    
  } catch (error) {
    console.error("Error cleaning raw bucket:", error);
    res.status(500).json({ error: "Failed to clean raw bucket" });
  }
});
// ROUTE 6: Get a pre-signed URL specifically for DOWNLOADING
app.get('/api/download-url', async (req, res) => {
  try {
    const { fileName } = req.query;
    
    if (!fileName) {
      return res.status(400).json({ error: "Filename is required" });
    }

    const command = new GetObjectCommand({
      Bucket: process.env.AWS_PROCESSED_BUCKET_NAME,
      Key: fileName,
      // 🌟 This is the magic line that forces a file download!
      ResponseContentDisposition: `attachment; filename="${fileName}"`
    });

    // Generate a quick 1-minute download link
    const downloadUrl = await getSignedUrl(s3Client, command, { expiresIn: 60 });
    
    res.json({ downloadUrl });
  } catch (error) {
    console.error("Error generating download URL:", error);
    res.status(500).json({ error: "Failed to generate download URL" });
  }
});
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});