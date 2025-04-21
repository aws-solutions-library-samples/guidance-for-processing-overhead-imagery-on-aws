type SnakeCaseKeys<T> = {
  [K in keyof T as string extends K ? K : K extends string ?
    (K extends Uppercase<K> ? K : `${K extends Capitalize<K> ? '_' : ''}${Lowercase<K>}`) : K
  ]: T[K];
};

export enum LoadingStatus {
  Success = "Success",
  Loading = "Loading",
  Error = "Error",
}

export interface NavbarState {
  drawerOpen: boolean;
}

export interface Viewpoint {
  viewpoint_id: string;
  viewpoint_name: string;
  viewpoint_status: string;
  bucket_name: string;
  object_key: string;
  tile_size: number;
  range_adjustment: string;
  local_object_path: string;
  error_message: string;
  expire_time: number;
}

export interface ViewpointMetadata {
  metadata: any;
}

export interface ViewpointBounds {
  bounds: number[];
}

export interface ViewpointInfo {
  type: string;
  features: any[];
}

export interface ViewpointStatistics {
  image_statistics: any;
}

export interface ViewpointExtent {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}

export interface SelectedViewpoint {
  viewpointId: string;
  viewpointTileSize: number;
}

export interface CreateViewpointForm {
  viewpointName: string;
  viewpointId: string;
  bucketName: string;
  objectKey: string;
  tileSize: number;
  rangeAdjustment: "NONE" | "MINMAX" | "DRA";
}

// Create a corresponding type for the API request
export interface CreateViewpointRequest {
  viewpoint_name: string;
  viewpoint_id: string;
  bucket_name: string;
  object_key: string;
  tile_size: number;
  range_adjustment: "NONE" | "MINMAX" | "DRA";
}

// Helper function to convert camelCase to snake_case for the API
export function viewpointToSnakeCase(data: CreateViewpointForm): CreateViewpointRequest {
  return {
    viewpoint_name: data.viewpointName,
    viewpoint_id: data.viewpointId,
    bucket_name: data.bucketName,
    object_key: data.objectKey,
    tile_size: data.tileSize,
    range_adjustment: data.rangeAdjustment
  };
}

export interface ImageViewerState {
  selectedViewpoint: SelectedViewpoint | null;
  viewpointsStatus: LoadingStatus;
  viewpointsError: string | null;
  viewpoints: Viewpoint[];
  viewpointBoundsStatus: LoadingStatus;
  viewpointBoundsError: string | null;
  viewpointBounds: ViewpointBounds;
  viewpointMetadataStatus: LoadingStatus;
  viewpointMetadataError: string | null;
  viewpointMetadata: ViewpointMetadata;
  viewpointInfoStatus: LoadingStatus;
  viewpointInfoError: string | null;
  viewpointInfo: ViewpointInfo;
  viewpointStatisticsStatus: LoadingStatus;
  viewpointStatisticsError: string | null;
  viewpointStatistics: ViewpointStatistics;
}

export interface S3Bucket {
  name: string;
  creationDate: string;
}

export interface S3Object {
  key: string;
  size: number;
  lastModified: string;
}

export interface S3State {
  buckets: S3Bucket[];
  selectedBucket: string | null;
  bucketObjects: S3Object[];
  bucketsStatus: LoadingStatus;
  bucketsError: string | null;
  objectsStatus: LoadingStatus;
  objectsError: string | null;
}

// export interface RootState {
//   // router: RouterState;
//   navbar: NavbarState;
//   imageViewer: ImageViewerState;
//   s3: S3State;
// }

// Helper type for async thunk responses
export interface ApiResponse<T> {
  data: T;
  status: LoadingStatus;
  error?: string;
}
