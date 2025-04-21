"use client";

import dynamic from "next/dynamic";

import { Sidebar } from "@/components/sidebar";
import { GlobeViewerSidebar } from "@/components/sidebars/globe-viewer-sidebar";

// import "cesium/Widgets/widgets.css";

const Cesium = dynamic(() => import("./cesium.tsx"), { ssr: false });

export default function GlobePage() {
  return (
    <>
      <Sidebar>
        <GlobeViewerSidebar />
      </Sidebar>
      <div className="w-full h-full">
        <Cesium />
      </div>
    </>
  );
}
