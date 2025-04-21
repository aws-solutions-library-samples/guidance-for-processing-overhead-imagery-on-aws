import { getSession } from "next-auth/react";
import { siteConfig } from "@/config/site";
import { S3Bucket, S3Object } from "@/store/types.ts";

export interface GetBucketsResponse {
  buckets: S3Bucket[];
}

export interface GetObjectsResponse {
  bucket: string;
  objects: S3Object[];
}

export interface GetPresignedUrlResponse {
  presignedUrl: string;
}

class S3Service {
  private baseUrl: string;
  private retryCount: number = 3;

  constructor() {
    this.baseUrl = siteConfig.s3_api_base_url || "";
  }

  private async getHeaders(): Promise<Headers> {
    const session = await getSession();
    const headers = new Headers({
      "Content-Type": "application/json",
      Accept: "application/json",
    });

    if (session?.accessToken) {
      headers.append("Authorization", `Bearer ${session.accessToken}`);
    }

    return headers;
  }

  async getBuckets(): Promise<S3Bucket[]> {
    const headers = await this.getHeaders();
    const response = await fetch(`${this.baseUrl}/s3`, { headers });

    if (!response.ok) throw new Error("Failed to fetch buckets");
    const data: GetBucketsResponse = await response.json();

    return data.buckets;
  }

  async getBucketContents(bucketName: string): Promise<S3Object[]> {
    const headers = await this.getHeaders();
    const response = await fetch(`${this.baseUrl}/s3/${bucketName}`, { headers });

    if (!response.ok) throw new Error("Failed to fetch bucket contents");
    const data: GetObjectsResponse = await response.json();

    return data.objects;
  }

  async getPresignedUrl(bucketName: string, objectKey: string): Promise<string> {
    const headers = await this.getHeaders();
    const response = await fetch(
      `${this.baseUrl}/s3/${bucketName}/${encodeURIComponent(objectKey)}`,
      { headers }
    );

    if (!response.ok) {
      throw new Error("Failed to get presigned URL");
    }

    const data: GetPresignedUrlResponse = await response.json();
    return data.presignedUrl;
  }

  async downloadFile(bucketName: string, objectKey: string): Promise<Blob> {
    const presignedUrl = await this.getPresignedUrl(bucketName, objectKey);
    console.log(`service | presignedUrl: ${presignedUrl}`);
    const response = await fetch(presignedUrl, {
      method: 'GET',
        mode: 'cors',
      credentials: 'omit',
      headers: {
      'Accept': '*/*',
      }
    });
    if (!response.ok) {
      console.log(response);
      console.log(response.ok);
      console.log(response.statusText);
      throw new Error(`Failed to download file: ${response.statusText}`);
    }

    return await response.blob();
  }
}

export const s3Service = new S3Service();