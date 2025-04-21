import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { s3Service } from "@/services/s3-service";
import { LoadingStatus, S3State } from "../types";

const initialState: S3State = {
  buckets: [],
  selectedBucket: null,
  bucketObjects: [],
  bucketsStatus: LoadingStatus.Success,
  bucketsError: null,
  objectsStatus: LoadingStatus.Success,
  objectsError: null
};

export const fetchBuckets = createAsyncThunk(
  "s3/fetchBuckets",
  async () => await s3Service.getBuckets()
);

export const fetchBucketContents = createAsyncThunk(
  "s3/fetchBucketContents",
  async (bucketName: string) => await s3Service.getBucketContents(bucketName)
);

const s3Slice = createSlice({
  name: "s3",
  initialState,
  reducers: {
    setSelectedBucket: (state, action) => {
      state.selectedBucket = action.payload;
    }
  },
  extraReducers: (builder) => {
    builder
      // Buckets
      .addCase(fetchBuckets.pending, (state) => {
        state.bucketsStatus = LoadingStatus.Loading;
      })
      .addCase(fetchBuckets.fulfilled, (state, action) => {
        state.bucketsStatus = LoadingStatus.Success;
        state.buckets = action.payload;
      })
      .addCase(fetchBuckets.rejected, (state, action) => {
        state.bucketsStatus = LoadingStatus.Error;
        state.bucketsError = action.error.message || "Failed to fetch buckets";
      })
      // Bucket Contents
      .addCase(fetchBucketContents.pending, (state) => {
        state.objectsStatus = LoadingStatus.Loading;
      })
      .addCase(fetchBucketContents.fulfilled, (state, action) => {
        state.objectsStatus = LoadingStatus.Success;
        state.bucketObjects = action.payload;
      })
      .addCase(fetchBucketContents.rejected, (state, action) => {
        state.objectsStatus = LoadingStatus.Error;
        state.objectsError = action.error.message || "Failed to fetch bucket contents";
      });
  }
});

export const { setSelectedBucket } = s3Slice.actions;
export default s3Slice.reducer;
