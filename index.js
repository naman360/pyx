require("dotenv").config();
const { S3Client, CreateBucketCommand } = require("@aws-sdk/client-s3");
const { LambdaClient, CreateFunctionCommand, UpdateFunctionCodeCommand } = require("@aws-sdk/client-lambda");
const { CloudFrontClient, CreateDistributionCommand, ListDistributionsCommand } = require("@aws-sdk/client-cloudfront");
const { createLambdaDeploymentZip } = require("./utils");

const lambdaClient = new LambdaClient({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});

const cloudFrontClient = new CloudFrontClient({
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

const checkIfCloudFrontDistributionExists = async () => {
    const listResult = await cloudFrontClient.send(new ListDistributionsCommand({}));
    const existingItems = listResult.DistributionList?.Items || [];
    const existingDistribution = existingItems.find((item) => {
        const origins = item.Origins?.Items || [];
        const originIds = origins.map((origin) => origin.Id);
        return (
            item.Comment === comment &&
            originIds.includes(originalBucket) &&
            originIds.includes(transformedBucket)
        );
    });
    return existingDistribution;
}

async function createCloudFrontDistribution() {
   
    const region = process.env.AWS_REGION;
    const originalBucket = process.env.PYX_ORIGINAL_IMAGE_BUCKET;
    const transformedBucket = process.env.PYX_TRANSFORMED_IMAGE_BUCKET;
    const toS3OriginDomain = (bucket) =>
        region === "us-east-1"
            ? `${bucket}.s3.amazonaws.com`
            : `${bucket}.s3.${region}.amazonaws.com`;
    const comment = "Pyx CloudFront Distribution";

    const existingDistribution = await checkIfCloudFrontDistributionExists();
    
    if (existingDistribution) {
        console.log("CloudFront distribution already exists");
        return existingDistribution;
    }

    const distributionConfig = {
        DistributionConfig: {
            DefaultCacheBehavior: {
                //CloudFront routes requests to this when using the default cache behavior.
                TargetOriginId: "image-origin-group",
                //P rotocol that viewers can use to access the files in the origin 
                ViewerProtocolPolicy: 'redirect-to-https',
                Compress: true,
                ForwardedValues: {
                    // Indicates whether you want CloudFront to forward query strings to the origin that is associated with this cache behavior and cache based on the query string parameters
                    QueryString: true,
                    Cookies: {
                        // Whether to forward cookies or not, none in case of S3 (it does not process cookies)
                        Forward: "none",
                    },
                },
                TrustedSigners: {
                    Enabled: false,
                    Quantity: 0,
                },
                MinTTL: 0,
                DefaultTTL: 86400,
                MaxTTL: 31536000,
            },
            // Unique identifier for the distribution.
            CallerReference: new Date().toISOString(),
            Comment: comment,
            // Whether the distribution is enabled.
            Enabled: true,
            Origins: {
                Items: [{
                    DomainName: toS3OriginDomain(originalBucket),
                    Id: originalBucket,
                    S3OriginConfig: {
                        OriginAccessIdentity: "",
                    },
                },
                {
                    DomainName: toS3OriginDomain(transformedBucket),
                    Id: transformedBucket,
                    S3OriginConfig: {
                        OriginAccessIdentity: "",
                    },
                }
                ],
                Quantity: 2,
            },
            OriginGroups: {
                Items: [
                    {
                        Id: "image-origin-group",
                        Members: {
                            Items: [
                                {
                                    OriginId: transformedBucket,
                                },
                                {
                                    OriginId: originalBucket,
                                },
                            ],
                            Quantity: 2,
                        },
                        FailoverCriteria: {
                            StatusCodes: {
                                Items: [403, 404, 500, 502, 503, 504],
                                Quantity: 6,
                            },
                        },
                    },
                ],
                Quantity: 1,
            },
        },
    };
    const createCloudFrontDistributionCommand = new CreateDistributionCommand(distributionConfig);
    const result = await cloudFrontClient.send(createCloudFrontDistributionCommand);
    console.log(result);
    return result;
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
    // await createLambdaFunction();
    await createCloudFrontDistribution();
}

main();