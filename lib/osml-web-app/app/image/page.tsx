"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import Map from "ol/Map";
import View from "ol/View";
import TileLayer from "ol/layer/Tile";
import Zoomify from "ol/source/Zoomify";
import { Projection } from "ol/proj";
import MousePosition from "ol/control/MousePosition";

import { Sidebar } from "@/components/sidebar";
import { ImageViewerSidebar } from "@/components/sidebars/image-viewer-sidebar";
import "ol/ol.css";
import { siteConfig } from "@/config/site";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { fetchViewpoints } from "@/store/slices/image-viewer-slice";

export default function ImagePage() {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<Map | null>(null);
  const currentLayer = useRef<TileLayer<any> | null>(null);
  const { data: session } = useSession();
  const dispatch = useAppDispatch();
  const { selectedViewpoint, viewpointBounds, viewpoints } = useAppSelector(
    (state) => state.imageViewer,
  );

  useEffect(() => {
    dispatch(fetchViewpoints());
  }, [dispatch]);

  const authenticatedTileLoadFunction = () => {
    return (imageTile: any, src: string) => {
      const xhr = new XMLHttpRequest();

      xhr.open("GET", src);

      if (session?.accessToken) {
        xhr.setRequestHeader("Authorization", `Bearer ${session.accessToken}`);
      }

      xhr.responseType = "blob";

      xhr.onload = () => {
        if (xhr.status === 200) {
          const blob = xhr.response;
          const blobUrl = URL.createObjectURL(blob);

          // Function to set the image source
          const setImageSource = () => {
            const imageElement = imageTile.getImage();

            if (imageElement) {
              imageElement.addEventListener("load", () => {
                URL.revokeObjectURL(blobUrl);
              });
              imageElement.src = blobUrl;
            }
          };

          // Listen for tile state changes
          imageTile.addEventListener("change", () => {
            if (imageTile.getState() === 1) {
              // 1 is the "IDLE" state when the image element is ready
              setImageSource();
            }
          });

          // Also try immediately in case the tile is already ready
          if (imageTile.getState() === 1) {
            setImageSource();
          }
        } else {
          console.error("Tile request failed with status:", xhr.status);
        }
      };

      xhr.onerror = () => {
        console.error("Tile loading failed:", src);
      };

      xhr.send();
    };
  };

  // Initialize map
  useEffect(() => {
    if (!mapRef.current) return;

    mapInstance.current = new Map({
      target: mapRef.current,
      controls: [],
    });

    const handleResize = () => {
      mapInstance.current?.updateSize();
    };

    window.addEventListener("resize", handleResize);

    return () => {
      mapInstance.current?.setTarget(undefined);
      mapInstance.current = null;
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  // Update layer when viewpoint changes
  useEffect(() => {
    if (
      !mapInstance.current ||
      !selectedViewpoint ||
      !viewpointBounds.bounds ||
      viewpointBounds.bounds.length !== 4
    )
      return;

    const viewpoint = viewpoints.find(
      (v) => v.viewpoint_id === selectedViewpoint.viewpointId,
    );

    if (!viewpoint) return;

    const bounds = viewpointBounds.bounds;
    const tileSize = viewpoint.tile_size;
    const viewpointId = viewpoint.viewpoint_id;

    const w = bounds[2] - bounds[0];
    const h = bounds[3] - bounds[1];
    const zoomOffset = Math.ceil(Math.sqrt(Math.max(w, h) / tileSize));

    const url = `${siteConfig.tile_server_base_url}/${viewpointId}/image/tiles/{z}/{x}/{y}.PNG?compression=NONE`;

    const source = new Zoomify({
      size: [w, h],
      url: "",
      tileSize: tileSize,
    });

    const defaultExtent = [0, 0, 100, 100];
    const extent = source.getTileGrid()?.getExtent() ?? defaultExtent;

    const projection = new Projection({
      code: "image",
      units: "pixels",
      extent: extent,
    });

    source.setTileUrlFunction((tileCoord) =>
      url
        .replace("{z}", (zoomOffset - tileCoord[0]).toString())
        .replace("{x}", tileCoord[1].toString())
        .replace("{y}", tileCoord[2].toString()),
    );

    source.setTileLoadFunction(authenticatedTileLoadFunction());

    // Remove existing layer and controls
    if (currentLayer.current) {
      mapInstance.current.removeLayer(currentLayer.current);
    }

    mapInstance.current.getControls().forEach((control) => {
      if (control instanceof MousePosition) {
        mapInstance.current?.removeControl(control);
      }
    });

    // Create and add new layer
    const viewpointLayer = new TileLayer({
      className: viewpointId,
      source: source,
    });

    const viewpointView = new View({
      projection: projection,
      extent: extent,
      constrainOnlyCenter: true,
    });

    // Update map with new view and layer
    mapInstance.current.setView(viewpointView);
    mapInstance.current.addLayer(viewpointLayer);

    currentLayer.current = viewpointLayer;
    viewpointView.fit(extent);

    // const mousePositionControl = new MousePosition({
    //   coordinateFormat: createStringXY(4),
    //   projection: projection,
    // });
    //
    // mapInstance.current.addControl(mousePositionControl);
  }, [selectedViewpoint, viewpointBounds, viewpoints, session]);

  return (
    <>
      <Sidebar>
        <ImageViewerSidebar />
      </Sidebar>
      <div className="w-full h-full">
        <div ref={mapRef} className="w-full h-full" />
      </div>
    </>
  );
}
