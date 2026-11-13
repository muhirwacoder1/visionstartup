"use node";

import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, CopyObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createHash, randomUUID } from "node:crypto";
import { ConvexError, v, type Infer } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { editor } from "./authz";
import { media } from "./validators";

const TYPES: Record<string,string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif",
  "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov",
};
function required(name: string) {
  const value = process.env[name];
  if (!value) throw new ConvexError("Media storage is not connected. Finish the R2 and Cloudinary setup.");
  return value;
}
function r2() {
  const id = required("R2_ACCOUNT_ID");
  if (!/^[a-f\d]{32}$/.test(id)) throw new ConvexError("Check the R2 account configuration.");
  return {
    client: new S3Client({
      region: "auto", endpoint: `https://${id}.r2.cloudflarestorage.com`,
      forcePathStyle: true, requestChecksumCalculation: "WHEN_REQUIRED", responseChecksumValidation: "WHEN_REQUIRED",
      credentials: { accessKeyId: required("R2_ACCESS_KEY_ID"), secretAccessKey: required("R2_SECRET_ACCESS_KEY") },
    }),
    Bucket: required("R2_BUCKET"),
  };
}
function cloudinary() {
  const cloud = required("CLOUDINARY_CLOUD_NAME");
  if (!/^[\w-]+$/.test(cloud)) throw new ConvexError("Check the Cloudinary cloud name.");
  return { cloud, apiKey: required("CLOUDINARY_API_KEY"), secret: required("CLOUDINARY_API_SECRET") };
}
function signed(params: Record<string,string>, secret: string) {
  return createHash("sha256").update(Object.keys(params).sort().map(k => `${k}=${params[k]}`).join("&") + secret).digest("hex");
}
const staging = (key: string) => key.replace("originals/", "incoming/");
export const begin = action({
  args: { name: v.string(), mime: v.string(), size: v.number() },
  returns: v.object({ url: v.string(), key: v.string() }),
  handler: async (ctx, { name, mime, size }) => {
    const identity = await editor(ctx.auth);
    const ext = TYPES[mime];
    const limit = (mime.startsWith("image/") ? 10 : 50) * 1024 * 1024;
    if (!ext || !Number.isSafeInteger(size) || size < 1 || size > limit) throw new ConvexError("Use a supported image up to 10 MB or video up to 50 MB.");
    const { client, Bucket } = r2();
    cloudinary();
    const key = `originals/${randomUUID()}.${ext}`;
    const url = await getSignedUrl(client, new PutObjectCommand({ Bucket, Key: staging(key), ContentType: mime, ContentLength: size }), {
      expiresIn: 300, signableHeaders: new Set(["content-type", "content-length"]),
    });
    await ctx.runMutation(internal.library.start, { key, owner: identity.subject, name: name.slice(0,200), mime, size, expires: Date.now() + 360000 });
    return { url, key };
  },
});

export const finish = action({
  args: { key: v.string() }, returns: media,
  handler: async (ctx, { key }): Promise<Infer<typeof media>> => {
    const identity = await editor(ctx.auth);
    const { client, Bucket } = r2();
    const { cloud, apiKey, secret } = cloudinary();
    const { name, mime, size } = await ctx.runMutation(internal.library.claim, { key, owner: identity.subject });
    const Kind = mime.startsWith("image/") ? "image" : "video";
    let copied = false;
    let delivered = false;
    const public_id = "nixtio-cms/" + key.split("/").at(-1)!.split(".")[0];
    try {
      const source = staging(key);
      const head = await client.send(new HeadObjectCommand({ Bucket, Key: source }));
      if (head.ContentType !== mime || head.ContentLength !== size || !head.ETag) throw new Error("File mismatch");
      await client.send(new CopyObjectCommand({ Bucket, Key: key, CopySource: Bucket + "/" + source, CopySourceIfMatch: head.ETag }));
      copied = true;
      const privateUrl = await getSignedUrl(client, new GetObjectCommand({ Bucket, Key: key }), { expiresIn: 300 });
      const params = { timestamp: String(Math.floor(Date.now()/1000)), public_id, overwrite: "false" };
      const form = new URLSearchParams({ ...params, file: privateUrl, api_key: apiKey, signature: signed(params, secret) });
      const response = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/${Kind}/upload`, { method:"POST", body: form, signal: AbortSignal.timeout(120000) });
      if (!response.ok) throw new Error("Delivery copy failed");
      delivered = true;
      const data = await response.json();
      const delivery = new URL(data.secure_url);
      if (data.public_id !== public_id || data.resource_type !== Kind || delivery.origin !== "https://res.cloudinary.com" ||
          !delivery.pathname.startsWith(`/${cloud}/${Kind}/upload/`)) throw new Error("Invalid delivery response");
      const transformation = Kind === "image" ? "f_auto,q_auto:good,w_2200,c_limit" : "f_mp4,q_auto:good,w_1920,c_limit";
      const asset = { key, name, mime, size, url: delivery.href.replace("/upload/", "/upload/" + transformation + "/"), cloudinaryId: public_id, created: Date.now() };
      await ctx.runMutation(internal.library.complete, { asset });
      return asset;
    } catch {
      if (copied) await client.send(new DeleteObjectCommand({ Bucket, Key: key })).catch(() => {});
      if (delivered) {
        const params = { timestamp: String(Math.floor(Date.now()/1000)), public_id, invalidate: "true" };
        await fetch(`https://api.cloudinary.com/v1_1/${cloud}/${Kind}/destroy`, {
          method:"POST", body:new URLSearchParams({ ...params, api_key: apiKey, signature: signed(params, secret) }),
          signal: AbortSignal.timeout(10000),
        }).catch(() => {});
      }
      throw new ConvexError("The media could not be processed. Check the file and storage connection, then try again.");
    }
  },
});

export const cleanup = internalAction({
  args: { key: v.string() }, returns: v.null(),
  handler: async (ctx, { key }) => {
    const { client, Bucket } = r2();
    await client.send(new DeleteObjectCommand({ Bucket, Key: staging(key) }));
    await ctx.runMutation(internal.library.forget, { key });
    return null;
  },
});

export const download = action({
  args: { key: v.string() }, returns: v.string(),
  handler: async (ctx, { key }): Promise<string> => {
    const stored = await ctx.runQuery(api.library.originalKey, { key });
    if (!stored) throw new ConvexError("This file was not found.");
    const { client, Bucket } = r2();
    return await getSignedUrl(client, new GetObjectCommand({ Bucket, Key: stored, ResponseContentDisposition: "attachment" }), { expiresIn: 90 });
  },
});
