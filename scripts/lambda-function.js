const sharp = require("sharp");
const { S3Client, GetObjectCommand, PutObjectCommand } = require("@aws-sdk/client-s3");

const s3Client = new S3Client({ region: process.env.AWS_REGION });

function readQueryParams(event) {
    const qs = event.queryStringParameters || {};
    const rawParams = new URLSearchParams(event.rawQueryString || "");
    return {
        format: qs.format || rawParams.get("format") || undefined,
        width:
            qs.width != null || rawParams.get("width") != null
                ? Number(qs.width ?? rawParams.get("width"))
                : undefined,
        height:
            qs.height != null || rawParams.get("height") != null
                ? Number(qs.height ?? rawParams.get("height"))
                : undefined,
    };
}

function readObjectKey(event) {
    const proxy = event?.pathParameters?.proxy;
    if (proxy) return decodeURIComponent(proxy);
    const rawPath = event?.rawPath || event?.path || event?.requestContext?.path || "";
    return decodeURIComponent(rawPath.replace(/^\/+/, ""));
}

async function getImageImageFromOriginalS3Bucket(objectKey) {
    const bucket = process.env.PYX_ORIGINAL_IMAGE_BUCKET;
    if (!bucket) {
        throw new Error("PYX_ORIGINAL_IMAGE_BUCKET is not set on Lambda");
    }
    
    console.log("reading from bucket", bucket, "key", objectKey)
    const result = await s3Client.send(
        new GetObjectCommand({
            Bucket: bucket,
            Key: objectKey,
        })
    );
    if (!result.Body) {
        throw new Error("S3 GetObject returned empty body");
    }
    const chunks = [];
    for await (const chunk of result.Body) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
}
async function saveImageToTransformedS3Bucket(objectKey, image, format) {
    const bucket = process.env.PYX_TRANSFORMED_IMAGE_BUCKET;
    if (!bucket) {
        throw new Error("PYX_TRANSFORMED_IMAGE_BUCKET is not set on Lambda");
    }
    const contentType = getOutputContentType(format);
    await s3Client.send(
        new PutObjectCommand({
            Bucket: bucket,
            Key: objectKey,
            Body: image,
            ContentType: contentType,
        })
    );
    console.log("saved to bucket", bucket, "key", objectKey);
}

function readOutputFormat(objectKey, format) {
    if (format) return format.toLowerCase();
    const ext = objectKey.split(".").pop()?.toLowerCase();
    return ext || "jpeg";
}

function getOutputContentType(format) {
    if (format === "jpg" || format === "jpeg") return "image/jpeg";
    if (format === "png") return "image/png";
    if (format === "webp") return "image/webp";
    if (format === "avif") return "image/avif";
    if (format === "gif") return "image/gif";
    return "application/octet-stream";
}

function buildTransformedKey(originalKey, { width, height, format }) {
    const dot = originalKey.lastIndexOf(".");
    const base = dot > 0 ? originalKey.slice(0, dot) : originalKey;
    const origExt = dot > 0 ? originalKey.slice(dot + 1).toLowerCase() : "jpg";
    const outFormat = readOutputFormat(originalKey, format);
    const sizePart = `${width ?? "auto"}x${height ?? "auto"}`;
    return `${base}__w-${sizePart}__f-${outFormat}.${outFormat || origExt}`;
}

async function transformImage(event) {
    const { format, width, height } = readQueryParams(event);
    const objectKey = readObjectKey(event);
    if (!objectKey) {
        return {
            statusCode: 400,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ error: "missing image path", objectKey, format, width, height }),
        };
    }
    if (objectKey === "favicon.ico") {
        return { statusCode: 204, body: "" };
    }
    const image = await getImageImageFromOriginalS3Bucket(objectKey);
    console.log({ objectKey, format, width, height, image });

    let pipeline = sharp(image);
    if (width != null || height != null) {
        pipeline = pipeline.resize(width, height);
    }
    if (format) {
        pipeline = pipeline.toFormat(format);
    }
    const outputFormat = readOutputFormat(objectKey, format);
    const out = await pipeline.toBuffer();
    const transformedKey = buildTransformedKey(objectKey, { width, height, format: outputFormat });
    await saveImageToTransformedS3Bucket(transformedKey, out, outputFormat);
    return {
        statusCode: 200,
        headers: {
            "Content-Type": getOutputContentType(outputFormat),
            "X-Pyx-Transformed-Key": transformedKey,
        },
        isBase64Encoded: true,
        body: out.toString("base64"),
    };
}

exports.handler = async (event) => {
    try {
        return await transformImage(event);
    } catch (error) {
        console.error("transform failed", error);
        return {
            statusCode: 500,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                error: "transform failed",
                message: error?.message || "unknown",
            }),
        };
    }
};
