import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";

// Dispute screenshots live in a Railway bucket (S3-compatible), not Postgres —
// keeps binary blobs out of the DB and off the audit/app-log write paths.
// The bucket is private; screenshots are served via short-lived presigned URLs
// rather than a public bucket, since they may contain account/personal info.

function isDisputeStorageConfigured(): boolean {
  return Boolean(
    process.env.DISPUTE_BUCKET_ENDPOINT &&
    process.env.DISPUTE_BUCKET_ACCESS_KEY_ID &&
    process.env.DISPUTE_BUCKET_SECRET_ACCESS_KEY &&
    process.env.DISPUTE_BUCKET_NAME,
  );
}

let client: S3Client | null = null;

function getClient(): S3Client {
  if (!client) {
    client = new S3Client({
      endpoint: process.env.DISPUTE_BUCKET_ENDPOINT!,
      region: process.env.DISPUTE_BUCKET_REGION || "auto",
      credentials: {
        accessKeyId: process.env.DISPUTE_BUCKET_ACCESS_KEY_ID!,
        secretAccessKey: process.env.DISPUTE_BUCKET_SECRET_ACCESS_KEY!,
      },
      forcePathStyle: process.env.DISPUTE_BUCKET_URL_STYLE === "path",
    });
  }
  return client;
}

export async function uploadDisputeScreenshot(
  buffer: Buffer,
  mimeType: string,
): Promise<string> {
  if (!isDisputeStorageConfigured()) {
    throw new Error("Screenshot storage is not configured");
  }
  const ext = mimeType.split("/")[1] || "bin";
  const key = `disputes/${randomUUID()}.${ext}`;
  await getClient().send(new PutObjectCommand({
    Bucket: process.env.DISPUTE_BUCKET_NAME!,
    Key: key,
    Body: buffer,
    ContentType: mimeType,
  }));
  return key;
}

export async function getDisputeScreenshotUrl(key: string): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: process.env.DISPUTE_BUCKET_NAME!,
    Key: key,
  });
  return getSignedUrl(getClient(), command, { expiresIn: 900 }); // 15 min
}

export async function deleteDisputeScreenshot(key: string): Promise<void> {
  if (!isDisputeStorageConfigured()) return;
  await getClient().send(new DeleteObjectCommand({
    Bucket: process.env.DISPUTE_BUCKET_NAME!,
    Key: key,
  }));
}