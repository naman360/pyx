const archiver = require('archiver');
const fs = require("fs");
const path = require("path");

/** TODO
 * 1. Introduce Lambda Layers for sharp
 */

async function createLambdaDeploymentZip() {
    const archive = archiver('zip', {
        zlib: { level: 9 },
    });
    const writeStream = fs.createWriteStream(process.env.PYX_LAMBDA_FUNCTION_DEPLOYMENT_ZIP);
    archive.pipe(writeStream);
    const lambdaFunctionPath = path.join(__dirname, "..","dist");
    archive.directory(lambdaFunctionPath, false);

    await new Promise((resolve, reject) => {
        writeStream.on("finish", resolve);
        writeStream.on("error", reject);
        archive.finalize();
      });
      const archivedBuffer= fs.readFileSync(process.env.PYX_LAMBDA_FUNCTION_DEPLOYMENT_ZIP);

    return archivedBuffer;
}
module.exports = {
    createLambdaDeploymentZip
}