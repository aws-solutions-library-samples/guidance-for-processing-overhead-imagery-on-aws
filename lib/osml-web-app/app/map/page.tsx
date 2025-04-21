"use client";

import { useEffect, useRef, useState } from "react";
import { default as OLMap } from "ol/Map";
import View from "ol/View";
import TileLayer from "ol/layer/Tile";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import GeoJSON from "ol/format/GeoJSON";
import { OSM, XYZ } from "ol/source";
import LayerGroup from "ol/layer/Group";
import { useAppSelector } from "@/store/hooks";

import { Sidebar } from "@/components/sidebar";
import { MapViewerSidebar } from "@/components/sidebars/map-viewer-sidebar";
import "ol/ol.css";
import { useSession } from "next-auth/react";
import { siteConfig } from "@/config/site.ts";
import { transformExtent } from "ol/proj";
import { DEFAULT_RESULT_STYLE } from "@/store/slices/map-viewer-slice.ts";
import Style from "ol/style/Style";
import Stroke from "ol/style/Stroke";
import Fill from "ol/style/Fill";
import Overlay, { Options as OverlayOptions } from 'ol/Overlay';
import { FeaturePopup } from "@/components/map/feature-popup.tsx";


export default function MapPage() {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<OLMap | null>(null);
  const layerGroups = useRef(new Map<string, LayerGroup>());
  const [selectedFeature, setSelectedFeature] = useState<any>(null);
  const [popupPosition, setPopupPosition] = useState<number[]>([0, 0]);
  const popupRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<Overlay | null>(null);
  const { data: session } = useSession();

  const { selectedJobs, geoJSONData, viewpointData, layerStyles, layerOrder } = useAppSelector(
    (state) => state.mapViewer.map
  );

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

          const setImageSource = () => {
            const imageElement = imageTile.getImage();
            if (imageElement) {
              imageElement.addEventListener("load", () => {
                URL.revokeObjectURL(blobUrl);
              });
              imageElement.src = blobUrl;
            }
          };

          imageTile.addEventListener("change", () => {
            if (imageTile.getState() === 1) {
              setImageSource();
            }
          });

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

    const baseLayer = new TileLayer({
      source: new OSM(),
    });

    // Create overlay for popup
    overlayRef.current = new Overlay({
      element: popupRef.current!,
      autoPan: {
        animation: {
          duration: 250
        }
      }
    } as OverlayOptions);

    mapInstance.current = new OLMap({
      target: mapRef.current,
      layers: [baseLayer],
      overlays: [overlayRef.current],
      view: new View({
        center: [0, 0],
        zoom: 2,
        minZoom: 2,
        maxZoom: 19,
      }),
    });

    // Add click handler
    mapInstance.current.on('click', (evt) => {
      const feature = mapInstance.current!.forEachFeatureAtPixel(
        evt.pixel,
        (feature) => feature
      );

      if (feature) {
        setSelectedFeature(feature);
        setPopupPosition(evt.coordinate);
        overlayRef.current?.setPosition(evt.coordinate);
      } else {
        setSelectedFeature(null);
        overlayRef.current?.setPosition(undefined);
      }
    });

    return () => {
      mapInstance.current?.setTarget(undefined);
      mapInstance.current = null;
    };
  }, []);

  // Handle layer updates when selection, GeoJSON data, style, etc. data changes
  useEffect(() => {
    if (!mapInstance.current) return;

    // Remove unselected layers
    const currentJobIds = Array.from(layerGroups.current.keys());
    currentJobIds.forEach(jobId => {
      if (!selectedJobs.find(job => job.job_id === jobId)) {
        const layerGroup = layerGroups.current.get(jobId);
        if (layerGroup) {
          mapInstance.current?.removeLayer(layerGroup);
          layerGroups.current.delete(jobId);
        }
      }
    });

    // Add or update layers for selected jobs
    selectedJobs.forEach(job => {
      const geoJSONEntry = geoJSONData[job.job_id];
      const viewpointEntry = viewpointData[job.job_id];

      // Create or get layer group
      let layerGroup = layerGroups.current.get(job.job_id);
      if (!layerGroup) {
        layerGroup = new LayerGroup({
          properties: {
            jobId: job.job_id,
            jobName: job.job_name
          }
        });
        layerGroups.current.set(job.job_id, layerGroup);
        mapInstance.current?.addLayer(layerGroup);
      }

      // Handle image layer from viewpoint
      if (viewpointEntry?.loaded && viewpointEntry.viewpoint.viewpoint_status === 'READY') {
        const existingImageLayer = layerGroup.getLayers().getArray()
          .find(layer => layer.get('name') === `${job.job_name || job.job_id}_image`);

        if (!existingImageLayer && viewpointEntry.extent !== undefined) {
          const extent = transformExtent(
            [
              viewpointEntry.extent.minLon,
              viewpointEntry.extent.minLat,
              viewpointEntry.extent.maxLon,
              viewpointEntry.extent.maxLat
            ],
            'EPSG:4326', // WGS84
            'EPSG:3857' // Web Mercator
          );
          const imageLayer = new TileLayer({
            source: new XYZ({
              url: `${siteConfig.tile_server_base_url}/${viewpointEntry.viewpoint.viewpoint_id}/map/tiles/WebMercatorQuad/{z}/{y}/{x}.PNG?invert_y=true`,
              projection: 'EPSG:3857',  // Web Mercator
              tileLoadFunction: authenticatedTileLoadFunction()
            }),
            properties: {
              name: `${job.job_name || job.job_id}_image`,
              type: 'image'
            },
            opacity: 1,
            zIndex: 1,
            extent: extent
          });
          layerGroup.getLayers().push(imageLayer);
        }
      }

      // Handle GeoJSON layer
      if (geoJSONEntry?.loaded && !geoJSONEntry.error) {
        const layerStyle = layerStyles[job.job_id] || DEFAULT_RESULT_STYLE;
        // Convert opacity to hex and concatenate it with the color
        const fillColor = layerStyle.color + Math.round(layerStyle.opacity * 255).toString(16).padStart(2, '0');

        const existingVectorLayer = layerGroup.getLayers().getArray()
          .find(layer => layer.get('name') === `${job.job_name || job.job_id}_vectors`) as VectorLayer<VectorSource>;

        if (existingVectorLayer) {
          // Update existing layer's style
          existingVectorLayer.setStyle(new Style({
            fill: new Fill({
              color: fillColor
            }),
            stroke: new Stroke({
              color: layerStyle.color,
              width: 2
            })
          }));
        } else {
          // Create new layer
          const vectorSource = new VectorSource({
            features: new GeoJSON().readFeatures(geoJSONEntry.data, {
              featureProjection: 'EPSG:3857'
            })
          });

          const vectorLayer = new VectorLayer({
            source: vectorSource,
            properties: {
              name: `${job.job_name || job.job_id}_vectors`,
              type: 'vector'
            },
            style: new Style({
              fill: new Fill({
                color: fillColor
              }),
              stroke: new Stroke({
                color: layerStyle.color,
                width: 2
              })
            }),
            zIndex: 2  // Ensure vectors are above image
          });

          layerGroup.getLayers().push(vectorLayer);

          // Zoom to layer extent if this is the only selected job
          if (selectedJobs.length === 1) {
            const extent = vectorSource.getExtent();
            mapInstance.current?.getView().fit(extent, {
              padding: [50, 50, 50, 50],
              maxZoom: 16,
              duration: 1000  // Smooth animation
            });
          }
        }
      }

      // Add loading or error indicators if needed
      if ((!geoJSONEntry?.loaded || !viewpointEntry?.loaded) &&
        !layerGroup.getLayers().getLength()) {
        // Could add a loading indicator layer here
        console.log(`Loading data for job ${job.job_id}...`);
      }

      if ((geoJSONEntry?.error || viewpointEntry?.error) &&
        !layerGroup.getLayers().getLength()) {
        // Could add an error indicator layer here
        console.error(`Error loading data for job ${job.job_id}`);
      }
    });
    // Handle setting layer order
    if (layerOrder.length > 0) {
      const layers = mapInstance.current.getLayers();
      const baseLayer = layers.item(0); // Store reference to base layer
      // Remove all layers except base
      while (layers.getLength() > 1) {
        layers.removeAt(1);
      }
      // Add layers back in reverse order (top of list = top layer)
      [...layerOrder].reverse().forEach(jobId => {
        const layerGroup = layerGroups.current.get(jobId);
        if (layerGroup) {
          layers.push(layerGroup);
        }
      });
    }
  }, [selectedJobs, geoJSONData, viewpointData, session, layerStyles, layerOrder]);

  return (
    <>
      <Sidebar>
        <MapViewerSidebar />
      </Sidebar>
      <div className="w-full h-full">
        <div ref={mapRef} className="w-full h-full" />
        <div ref={popupRef} className="ol-popup">
          {selectedFeature && (
            <FeaturePopup
              feature={selectedFeature}
              position={popupPosition}
              onClose={() => {
                setSelectedFeature(null);
                overlayRef.current?.setPosition(undefined);
              }}
            />
          )}
        </div>
      </div>
    </>
  );
}
