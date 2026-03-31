const sharp = require("sharp");

async function loadImageBuffer(imageUrl) {
    const res = await fetch(imageUrl);
    if (!res.ok) {
        throw new Error(`Failed to fetch image: ${res.status}`);
    }
    return Buffer.from(await res.arrayBuffer());
}

function readQueryParams(event) {
    const qs = event.queryStringParameters || {};
    return {
        image: qs.image,
        format: qs.format,
        width: qs.width != null ? Number(qs.width) : undefined,
        height: qs.height != null ? Number(qs.height) : undefined,
    };
}

async function transformImage(event) {
    const { image, format, width, height } = readQueryParams(event);
    console.log({ image, format, width, height });
    if (!image) {
        return { statusCode: 400, body: JSON.stringify({ error: "missing image query param" }) };
    }
    const input = await loadImageBuffer(image);
    let pipeline = sharp(input);
    if (width != null || height != null) {
        pipeline = pipeline.resize(width, height);
    }
    if (format) {
        pipeline = pipeline.toFormat(format);
    }
    const out = await pipeline.toBuffer();
    return {
        statusCode: 200,
        headers: { "Content-Type": `image/${format || "jpeg"}` },
        isBase64Encoded: true,
        body: out.toString("base64"),
    };
}

exports.handler = async (event) => {
    return await transformImage(event);
};
