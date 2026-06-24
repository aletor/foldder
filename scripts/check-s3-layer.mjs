import fs from "fs";
import sharp from "sharp";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});
const key =
  "knowledge-files/user-assets/1d760e9bdac7a6cce988/generated/layerizer/1782204249146-6ed1c3c3-03b8-4fee-a139-a3e9ede6f9ea-66b657eb-5e06-4f75-906f-d02977629999_layer_det_0_hichou.png";
const res = await s3.send(new GetObjectCommand({ Bucket: process.env.AWS_S3_BUCKET_NAME, Key: key }));
const buf = Buffer.from(await res.Body.transformToByteArray());
fs.writeFileSync("/tmp/layer_s3.png", buf);
const m = await sharp(buf).metadata();
const { data } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
let t = 0;
let o = 0;
for (let i = 3; i < data.length; i += 4) {
  if (data[i] < 16) t++;
  else o++;
}
console.log(
  "s3 layer",
  `${m.width}x${m.height}`,
  "hasAlpha",
  m.hasAlpha,
  "transparent%",
  ((100 * t) / (t + o)).toFixed(1),
);
