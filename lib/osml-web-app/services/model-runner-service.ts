import { getSession } from "next-auth/react";
import { siteConfig } from "@/config/site";

export interface NMSAlgorithm {
  algorithm_type: "NMS";
  iouThreshold: number;
}

export interface SoftNMSAlgorithm {
  algorithm_type: "SOFT_NMS";
  iouThreshold: number;
  skipBoxThreshold: number;
  sigma: number;
}

export interface FeatureDistillation {
  step: "FEATURE_DISTILLATION";
  algorithm: NMSAlgorithm | SoftNMSAlgorithm;
}

export interface Output {
  type: string;
  bucket?: string;
  prefix?: string;
  stream?: string;
  batchSize?: number;
}

export interface ImageProcessor {
  name: string;
  type: string;
}

export interface ImageProcessingJob {
  job_id: string;
  status: string;
  updated_at: string;
  job_name?: string;
  image_status?: string;
  image_id?: string;
  processing_duration?: number;
  output_bucket?: string;
}

export interface CreateJobRequest {
  jobName: string;
  jobId: string;
  imageUrls: string[];
  outputs: Output[];
  imageProcessor: ImageProcessor;
  imageProcessorTileSize: number;
  imageProcessorTileOverlap: number;
  imageProcessorTileFormat: string;
  imageProcessorTileCompression: string;
  postProcessing: FeatureDistillation[];
  regionOfInterest?: Record<string, any>;
  rangeAdjustment: "NONE" | "MINMAX" | "DRA";
}

export interface ListJobsResponse {
  jobs: ImageProcessingJob[];
}

class ModelRunnerService {
  private baseUrl: string;
  private retryCount: number = 3;

  constructor() {
    this.baseUrl = siteConfig.model_runner_api_base_url || "";
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

  async createImageProcessingJob(
    jobRequest: CreateJobRequest
  ): Promise<ImageProcessingJob> {
    const headers = await this.getHeaders();
    const response = await fetch(`${this.baseUrl}/jobs`, {
      method: "POST",
      headers,
      body: JSON.stringify(jobRequest),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || "Failed to create image processing job");
    }

    return response.json();
  }

  async listImageProcessingJobs(): Promise<ImageProcessingJob[]> {
    const headers = await this.getHeaders();
    const response = await fetch(`${this.baseUrl}/jobs`, { headers });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || "Failed to list image processing jobs");
    }

    const data: ListJobsResponse = await response.json();
    return data.jobs;
  }

  async getImageProcessingJob(jobId: string): Promise<ImageProcessingJob> {
    const headers = await this.getHeaders();
    const response = await fetch(`${this.baseUrl}/jobs/${jobId}`, {
      headers,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || "Failed to get image processing job");
    }

    return response.json();
  }

  // Helper method to poll job status
  async pollJobStatus(
    jobId: string,
    intervalMs: number = 5000,
    timeoutMs: number = 300000
  ): Promise<ImageProcessingJob> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const job = await this.getImageProcessingJob(jobId);

      if (job.status === "COMPLETED" || job.status === "FAILED") {
        return job;
      }

      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }

    throw new Error("Job polling timed out");
  }

  // Utility method to create and wait for job completion
  async processImageAndWait(
    jobRequest: CreateJobRequest,
    pollIntervalMs?: number,
    timeoutMs?: number
  ): Promise<ImageProcessingJob> {
    const job = await this.createImageProcessingJob(jobRequest);
    return this.pollJobStatus(job.job_id, pollIntervalMs, timeoutMs);
  }
}

export const modelRunnerService = new ModelRunnerService();