import { ImageProcessingJob } from "@/services/model-runner-service";
import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { s3Service } from "@/services/s3-service";
import { viewpointService } from "@/services/viewpoint-service";
import { Viewpoint, ViewpointExtent } from "@/store/types.ts";
import { AppDispatch, RootState } from "@/store/store.ts";

// Constants
const VIEWPOINT_POLL_INTERVAL = 5000; // 5 seconds
const VIEWPOINT_POLL_TIMEOUT = 300000; // 5 minutes

const DEFAULT_RESULT_STYLE: VectorStyle = {
  color: '#ffff00',  // Default yellow color
  opacity: 0.5       // Default 50% opacity
};

// Types
interface VectorStyle {
  color: string;  // HTML color string (e.g., '#ff0000')
  opacity: number;  // 0-1 value
}

interface GeoJSONData {
  jobId: string;
  data: any;
  loaded: boolean;
  error?: string;
}

interface ViewpointData {
  jobId: string;
  viewpoint: Viewpoint;
  extent?: ViewpointExtent;
  loaded: boolean;
  error?: string;
  isPolling?: boolean;
  pollStartTime?: number;
}

interface MapLayerState {
  selectedJobs: ImageProcessingJob[];
  geoJSONData: Record<string, GeoJSONData>;
  viewpointData: Record<string, ViewpointData>;
  layerStyles: Record<string, VectorStyle>;  // jobId -> style mapping
  layerOrder: string[];
}

interface MapViewerState {
  map: MapLayerState;
}

// Initial State
const initialState: MapViewerState = {
  map: {
    selectedJobs: [],
    geoJSONData: {},
    viewpointData: {},
    layerStyles: {},
    layerOrder:[]
  }
};

// Slice
export const mapViewerSlice = createSlice({
  name: "mapViewer",
  initialState,
  reducers: {
    setSelectedJobs: (state, action: PayloadAction<ImageProcessingJob[]>) => {
      state.map.selectedJobs = action.payload;

      // Clean up data for unselected jobs
      const selectedJobIds = new Set(action.payload.map(job => job.job_id));
      Object.keys(state.map.geoJSONData).forEach(jobId => {
        if (!selectedJobIds.has(jobId)) {
          delete state.map.geoJSONData[jobId];
        }
      });
      Object.keys(state.map.viewpointData).forEach(jobId => {
        if (!selectedJobIds.has(jobId)) {
          delete state.map.viewpointData[jobId];
        }
      });
    },
    setGeoJSONData: (state, action: PayloadAction<GeoJSONData>) => {
      state.map.geoJSONData[action.payload.jobId] = action.payload;
    },
    setGeoJSONError: (state, action: PayloadAction<{ jobId: string, error: string }>) => {
      state.map.geoJSONData[action.payload.jobId] = {
        jobId: action.payload.jobId,
        data: null,
        loaded: true,
        error: action.payload.error
      };
    },
    setViewpointData: (state, action: PayloadAction<ViewpointData>) => {
      state.map.viewpointData[action.payload.jobId] = action.payload;
    },
    setViewpointExtent: (state, action: PayloadAction<{ jobId: string, extent: ViewpointExtent }>) => {
      if (state.map.viewpointData[action.payload.jobId]) {
        state.map.viewpointData[action.payload.jobId].extent = action.payload.extent;
      }
    },
    setViewpointError: (state, action: PayloadAction<{ jobId: string, error: string }>) => {
      state.map.viewpointData[action.payload.jobId] = {
        jobId: action.payload.jobId,
        viewpoint: {
          viewpoint_id: action.payload.jobId,
          viewpoint_name: "",
          viewpoint_status: "ERROR",
          bucket_name: "",
          object_key: "",
          tile_size: 0,
          range_adjustment: "",
          local_object_path: "",
          error_message: action.payload.error,
          expire_time: 0
        },
        loaded: true,
        isPolling: false,
        error: action.payload.error
      };
    },
    setLayerStyle: (state, action: PayloadAction<{ jobId: string, style: VectorStyle }>) => {
      state.map.layerStyles[action.payload.jobId] = action.payload.style;
    },
    setLayerOrder: (state, action: PayloadAction<string[]>) => {
      state.map.layerOrder = action.payload;
    },
    setDefaultStyle: (state, action: PayloadAction<{ jobId: string }>) => {
      state.map.layerStyles[action.payload.jobId] = DEFAULT_RESULT_STYLE;
    }
  }
});

// Action Creators
export const {
  setSelectedJobs,
  setGeoJSONData,
  setGeoJSONError,
  setViewpointData,
  setViewpointError,
  setLayerStyle,
  setLayerOrder,
  setDefaultStyle
} = mapViewerSlice.actions;

// Thunks
export const fetchGeoJSONData = (job: ImageProcessingJob) => async (
  dispatch: AppDispatch,
  getState: () => RootState
) => {
  const state = getState();
  const existingData: GeoJSONData | undefined = state.mapViewer.map.geoJSONData[job.job_id];

  // Skip if already loaded
  if (existingData?.loaded) return;

  try {
    if (!job.output_bucket) {
      throw new Error('No output bucket defined for job');
    }

    const geojsonBlob = await s3Service.downloadFile(
      job.output_bucket,
      `${job.job_name}/${job.job_id}.geojson`
    );
    const geojsonText = await geojsonBlob.text();
    const geojsonData = JSON.parse(geojsonText);

    dispatch(setGeoJSONData({
      jobId: job.job_id,
      data: geojsonData,
      loaded: true
    }));
  } catch (error) {
    console.error(`Error loading GeoJSON for job ${job.job_id}:`, error);
    dispatch(setGeoJSONError({
      jobId: job.job_id,
      error: error instanceof Error ? error.message : 'Failed to load GeoJSON data'
    }));
  }
};

export const fetchViewpointStatus = (jobId: string) => async (
  dispatch: AppDispatch,
  getState: () => RootState
) => {
  const state = getState();
  const existingData = state.mapViewer.map.viewpointData[jobId];

  // If already loaded with READY status and has extent, or has error, don't poll
  if (existingData?.loaded &&
    (existingData.error || (existingData.viewpoint?.viewpoint_status === 'READY' && existingData.extent))) {
    return;
  }

  try {
    const viewpoint = await viewpointService.getViewpoint(jobId);

    switch (viewpoint.viewpoint_status) {
      case 'CREATING':
        dispatch(setViewpointData({
          jobId,
          viewpoint,
          loaded: false,
          isPolling: true,
          pollStartTime: existingData?.pollStartTime || Date.now()
        }));

        setTimeout(() => {
          dispatch(fetchViewpointStatus(jobId));
        }, VIEWPOINT_POLL_INTERVAL);
        break;

      case 'READY':
        // Fetch extent when viewpoint is ready
        try {
          const extent = await viewpointService.getViewpointExtentWGS84(viewpoint.viewpoint_id);

          dispatch(setViewpointData({
            jobId,
            viewpoint,
            extent,  // Include the extent in the viewpoint data
            loaded: true,
            isPolling: false
          }));
        } catch (error) {
          console.error(`Failed to fetch extent for viewpoint ${viewpoint.viewpoint_id}:`, error);
          dispatch(setViewpointData({
            jobId,
            viewpoint,
            loaded: true,
            isPolling: false
          }));
        }
        break;

      case 'ERROR':
        dispatch(setViewpointError({
          jobId,
          error: viewpoint.error_message || 'Viewpoint creation failed'
        }));
        break;

      default:
        dispatch(setViewpointError({
          jobId,
          error: `Unknown viewpoint status: ${viewpoint.viewpoint_status}`
        }));
    }
  } catch (error) {
    console.error(`Error loading viewpoint for job ${jobId}:`, error);
    dispatch(setViewpointError({
      jobId,
      error: error instanceof Error ? error.message : 'Failed to load viewpoint'
    }));
  }
};

// Middleware
export const fetchDataMiddleware = (store: any) => (next: any) => (action: any) => {
  const result = next(action);

  if (setSelectedJobs.match(action)) {
    action.payload.forEach((job: ImageProcessingJob) => {
      store.dispatch(fetchGeoJSONData(job));
      store.dispatch(fetchViewpointStatus(job.job_id));
    });
  }

  return result;
};

export default mapViewerSlice.reducer;

export { DEFAULT_RESULT_STYLE };
