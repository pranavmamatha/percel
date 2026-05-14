import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3"
import fs from "fs"
import path from "path"

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
  forcePathStyle: true
})


function getAllFiles(dir: string) {
  let result: string[] = [];
  const list = fs.readdirSync(dir);

  list.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath)

    if (stat && stat.isDirectory()) {
      result = result.concat(getAllFiles(filePath))
    } else {
      result.push(filePath);
    }
  })
  return result;
}

function getContentType(file: string) {
  if (file.endsWith(".html")) return "text/html";
  if (file.endsWith(".css")) return "text/css";
  if (file.endsWith(".js")) return "application/javascript";
  if (file.endsWith(".svg")) return "image/svg+xml";
  return "application/octet-stream";
}

async function uploadDirectory(localpath: string, deploymentId: string) {
  const files = getAllFiles(localpath);

  for (const file of files) {
    const fileStream = fs.readFileSync(file);
    const key = `${deploymentId}/${path.relative(localpath, file)}`
    await s3.send(new PutObjectCommand({
      Bucket: "deployments",
      Key: key,
      Body: fileStream,
      ContentType: getContentType(file)
    }));
  }
}

export { uploadDirectory }
