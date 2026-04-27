import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import Jimp from "jimp";

const s3 = new S3Client({ region: process.env.AWS_REGION || "eu-north-1" });

export const handler = async (event) => {
  try {
    const sourceBucket = event.Records[0].s3.bucket.name;
    const rawFileName = decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, ' '));
    const destinationBucket = "shanks-image-app-processed-2026"; 

    // Extract the filter name using our triple-underscore trick
    const parts = rawFileName.split('___');
    const filterType = parts.length > 1 ? parts[0] : 'greyscale';
    const originalName = parts.length > 1 ? parts[1] : rawFileName;

    const getCommand = new GetObjectCommand({ Bucket: sourceBucket, Key: rawFileName });
    const { Body } = await s3.send(getCommand);
    const imageByteArray = await Body.transformToByteArray();
    
    const image = await Jimp.read(Buffer.from(imageByteArray));
    
    // Standardize the size first
    image.resize(500, Jimp.AUTO);

    // Apply the Dynamic Filter!
    if (filterType === 'greyscale') {
      image.greyscale();
    } else if (filterType === 'blur') {
      image.blur(5); // Blurs by 5 pixels
    } else if (filterType === 'sepia') {
      image.sepia();
    } else if (filterType === 'invert') {
      image.invert();
    }

    const processedBuffer = await image.getBufferAsync(Jimp.MIME_JPEG);

    const putCommand = new PutObjectCommand({
      Bucket: destinationBucket,
      Key: `processed-${originalName}`, // Save it with the clean original name
      Body: processedBuffer,
      ContentType: "image/jpeg",
    });
    
    await s3.send(putCommand);
    return { statusCode: 200, body: 'Success' };

  } catch (error) {
    console.error(error);
    throw error;
  }
};