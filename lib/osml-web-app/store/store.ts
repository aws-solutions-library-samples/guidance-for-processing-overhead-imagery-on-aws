import { configureStore } from "@reduxjs/toolkit";

import navbarReducer from "./slices/navbar-slice";
import imageViewerReducer from "./slices/image-viewer-slice";
import s3Reducer from "./slices/s3-slice";
import mapViewerReducer, {
  fetchDataMiddleware
} from "./slices/map-viewer-slice.ts";

export const store = configureStore({
  reducer: {
    navbar: navbarReducer,
    imageViewer: imageViewerReducer,
    s3: s3Reducer,
    mapViewer: mapViewerReducer
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(fetchDataMiddleware),
  devTools: process.env.NODE_ENV !== "production",
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
export default store;
