import { Viewer, ImageryLayer } from "resium";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Viewer as CesiumViewer,
  ImageryProvider,
  createWorldTerrainAsync,
  TerrainProvider,
} from "cesium";

import {
  generateImageryProviders,
  generateProviderViewModels,
} from "@/utils/globe-providers";

interface ViewerConfig {
  imageryProvider: ImageryProvider;
  terrainProvider: TerrainProvider;
}

export default function Cesium() {
  const viewerRef = useRef<CesiumViewer | null>(null);
  const [viewerConfig, setViewerConfig] = useState<ViewerConfig | null>(null);

  // Generate provider view models once
  const providerViewModels = useMemo(() => generateProviderViewModels(), []);

  // Load providers before first render
  useEffect(() => {
    const initializeViewer = async () => {
      try {
        const [imageryProviders, terrainProvider] = await Promise.all([
          generateImageryProviders(),
          createWorldTerrainAsync(),
        ]);

        if (imageryProviders.length > 0) {
          setViewerConfig({
            imageryProvider: imageryProviders[0],
            terrainProvider,
          });
        }
      } catch (error) {
        console.error("Failed to initialize viewer:", error);
      }
    };

    initializeViewer();
  }, []);

  if (!viewerConfig) {
    return <div>Loading Globe...</div>;
  }

  return (
    <Viewer
      ref={(viewer) => {
        if (viewer?.cesiumElement) {
          viewerRef.current = viewer.cesiumElement;
        }
      }}
      scene3DOnly
      geocoder={false}
      homeButton={false}
      imageryProviderViewModels={providerViewModels}
      navigationHelpButton={false}
      style={{
        position: "absolute",
        top: "var(--navbar-height)",
        left: 0,
        right: 0,
        bottom: 0,
        height: "calc(100% - var(--navbar-height))",
        width: "100%",
      }}
      terrainProvider={viewerConfig.terrainProvider}
    >
      <ImageryLayer imageryProvider={viewerConfig.imageryProvider} />
    </Viewer>
  );
}

/*required to disable Ion calls*/
