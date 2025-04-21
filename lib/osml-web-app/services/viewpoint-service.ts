import { getSession } from "next-auth/react";

import {
  CreateViewpointRequest,
  Viewpoint,
  ViewpointBounds,
  ViewpointInfo,
  ViewpointMetadata,
  ViewpointStatistics,
  ViewpointExtent
} from "@/store/types";
import { siteConfig } from "@/config/site";

export interface GetViewpointsResponse {
  items: Viewpoint[];
  next_token: string;
}

class ViewpointService {
  private baseUrl: string;
  private retryCount: number = 3;

  constructor() {
    this.baseUrl = siteConfig.tile_server_base_url || "";
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

  async getViewpoints(): Promise<Viewpoint[]> {
    const headers = await this.getHeaders();
    const response = await fetch(`${this.baseUrl}`, { headers });

    if (!response.ok) throw new Error("Failed to fetch viewpoints");
    const data: GetViewpointsResponse = await response.json();

    return data.items;
  }

  async getViewpoint(viewpointId: string): Promise<Viewpoint> {
    const headers = await this.getHeaders();
    const response = await fetch(
      `${this.baseUrl}/${viewpointId}`,
      {
        headers,
      }
    );

    if (!response.ok) throw new Error("Failed to fetch viewpoint");

    return response.json();
  }

  async createViewpoint(
    createViewpointData: CreateViewpointRequest,
  ): Promise<Viewpoint> {
    const headers = await this.getHeaders();
    const response = await fetch(`${this.baseUrl}`, {
      method: "POST",
      headers,
      body: JSON.stringify(createViewpointData),
    });

    if (!response.ok) throw new Error("Failed to create viewpoint");

    return response.json();
  }

  async getViewpointBounds(viewpointId: string): Promise<ViewpointBounds> {
    const headers = await this.getHeaders();
    const response = await fetch(
      `${this.baseUrl}/${viewpointId}/image/bounds`,
      {
        headers,
      },
    );

    if (!response.ok) throw new Error("Failed to fetch viewpoint bounds");

    return response.json();
  }

  async getViewpointMetadata(viewpointId: string): Promise<ViewpointMetadata> {
    const headers = await this.getHeaders();
    const response = await fetch(
      `${this.baseUrl}/${viewpointId}/image/metadata`,
      { headers },
    );

    if (!response.ok) throw new Error("Failed to fetch viewpoint metadata");

    return response.json();
  }

  async getViewpointInfo(viewpointId: string): Promise<ViewpointInfo> {
    const headers = await this.getHeaders();
    const response = await fetch(`${this.baseUrl}/${viewpointId}/image/info`, {
      headers,
    });

    if (!response.ok) throw new Error("Failed to fetch viewpoint info");

    return response.json();
  }

  async getViewpointStatistics(
    viewpointId: string,
  ): Promise<ViewpointStatistics> {
    const headers = await this.getHeaders();
    const response = await fetch(
      `${this.baseUrl}/${viewpointId}/image/statistics`,
      { headers },
    );

    if (!response.ok) throw new Error("Failed to fetch viewpoint statistics");

    return response.json();
  }

  async getViewpointExtentWGS84(viewpointId: string): Promise<ViewpointExtent | undefined> {
    try {
      const statistics = await this.getViewpointStatistics(viewpointId);

      const polygonCoordinates = statistics.image_statistics?.wgs84Extent?.coordinates?.[0];

      if (!polygonCoordinates || !Array.isArray(polygonCoordinates)) {
        console.warn(`Invalid or missing WSG84 coordinates for viewpoint ${viewpointId}`);
        return undefined;
      }

      // Extract all longitude and latitude values from the polygon points
      const lons = polygonCoordinates.map(point => point[0]);
      const lats = polygonCoordinates.map(point => point[1]);

      return {
        minLon: Math.min(...lons),
        minLat: Math.min(...lats),
        maxLon: Math.max(...lons),
        maxLat: Math.max(...lats)
      };
    } catch (error) {
      console.error(`Failed to fetch WGS84 coordinates for viewpoint ${viewpointId}:`, error);
      return undefined;
    }
  }


  async deleteViewpoint(viewpointId: string): Promise<Viewpoint> {
    const headers = await this.getHeaders();
    const response = await fetch(`${this.baseUrl}/${viewpointId}`, {
      method: "DELETE",
      headers,
    });

    if (!response.ok) throw new Error("Failed to delete viewpoint");

    return response.json();
  }
}

export const viewpointService = new ViewpointService();
