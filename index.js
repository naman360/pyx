require("dotenv").config();
const { S3Client,CreateBucketCommand } = require("@aws-sdk/client-s3");

async function main() {
    const s3Client = new S3Client({
        region: process.env.AWS_REGION,
        credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        },
    });
    const originalImageBucketName = process.env.PYX_ORIGINAL_IMAGE_BUCKET;
    const transformedImageBucketName = process.env.PYX_TRANSFORMED_IMAGE_BUCKET;
    const createOriginalImageBucketCommand = new CreateBucketCommand({
        Bucket: originalImageBucketName,
    });
    const createTransformedImageBucketCommand = new CreateBucketCommand({
        Bucket: transformedImageBucketName,
    });

    const result = await s3Client.send(createOriginalImageBucketCommand);
    const transformedImageBucketResult = await s3Client.send(createTransformedImageBucketCommand);

}

main();