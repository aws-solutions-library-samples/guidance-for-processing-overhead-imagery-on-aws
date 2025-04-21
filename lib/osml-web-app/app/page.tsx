import { Card, CardBody, CardHeader } from "@heroui/card";
import Link from "next/link";

const toolCards = [
  {
    title: "Image Viewer",
    description:
      "A powerful tool for viewing and analyzing high-resolution imagery. Features include zoom capabilities, band combination selection, and image enhancement tools. Perfect for satellite imagery and aerial photography analysis.",
    path: "/image",
    icon: "🖼️",
  },
  {
    title: "Map Viewer",
    description:
      "Interactive map interface supporting multiple layers, markers, and overlays. Includes features for distance measurement, area calculation, and custom styling options. Ideal for geographic data visualization.",
    path: "/map",
    icon: "🗺️",
  },
  {
    title: "Globe",
    description:
      "Immersive 3D globe visualization tool with support for various data layers, terrain visualization, and interactive navigation. Perfect for global-scale data analysis and presentation.",
    path: "/globe",
    icon: "🌎",
  },
  // {
  //   title: "Geospatial Agent",
  //   description:
  //     "Advanced geospatial data exploration tool with support for conversational AI spatial queries and data discovery. Ideal for spatial analysis.",
  //   path: "/geo-agent",
  //   icon: "🕶️",
  // },
];

export default function Home() {
  return (
    <section className="py-8 md:py-10">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {toolCards.map((tool) => (
          <Link key={tool.title} href={tool.path}>
            <Card className="hover:scale-105 transition-transform duration-200 cursor-pointer h-full">
              <CardHeader className="flex gap-3">
                <span className="text-2xl">{tool.icon}</span>
                <h2 className="text-xl font-semibold">{tool.title}</h2>
              </CardHeader>
              <CardBody>
                <p className="text-default-600">{tool.description}</p>
              </CardBody>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  );
}
