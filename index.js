require("dotenv").config();
const { S3Client, CreateBucketCommand } = require("@aws-sdk/client-s3");
const { LambdaClient, CreateFunctionCommand, UpdateFunctionCodeCommand } = require("@aws-sdk/client-lambda");
const { createLambdaDeploymentZip } = require("./utils");

const lambdaClient = new LambdaClient({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});

async function createLambdaFunction() {
    const createLambdaFunctionCommand = new CreateFunctionCommand({
        FunctionName: process.env.PYX_LAMBDA_FUNCTION_NAME,
        Runtime: "nodejs18.x",
        Handler: "index.handler",
        Role: process.env.AWS_LAMBDA_ROLE,
        Code: {
            ZipFile: await createLambdaDeploymentZip(),
        },
    });
    try {
        const result = await lambdaClient.send(createLambdaFunctionCommand);
        console.log(result);
    } catch (error) {
        if (error.name === "ResourceConflictException") {
            console.log("Lambda function already exists");
            const updateLambdaFunctionCommand = new UpdateFunctionCodeCommand({
                FunctionName: process.env.PYX_LAMBDA_FUNCTION_NAME,
                ZipFile: await createLambdaDeploymentZip(),
            });
            await lambdaClient.send(updateLambdaFunctionCommand);
            console.log("Lambda function updated");
        } else {
            throw error;
        }
    }
}

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
    await createLambdaFunction();

}

main();