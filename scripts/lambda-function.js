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
    const rawParams = new URLSearchParams(event.rawQueryString || "");
    return {
        image: qs.image || rawParams.get("image") || undefined,
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

async function transformImage(event) {
    const { image, format, width, height } = readQueryParams(event);
    console.log({ image, format, width, height });
    if (!image) {
        return {
            statusCode: 400,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ error: "missing image query param", image, format, width, height }),
        };
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
