export type SiteConfig = typeof siteConfig;

export const siteConfig = {
  name: "OversightML",
  description:
    "View and process large scale satellite and aerial images in the cloud.",
  links: {
    github:
      "https://github.com/aws-solutions-library-samples/guidance-for-processing-overhead-imagery-on-aws",
    docs: "https://heroui.com",
  },
  tile_server_base_url: process.env.NEXT_PUBLIC_TILE_SERVER_URL || "",
  stac_catalog_url: process.env.NEXT_PUBLIC_STAC_CATALOG_URL || "",
  s3_api_base_url: process.env.NEXT_PUBLIC_S3_API_URL || "",
  model_runner_api_base_url: process.env.NEXT_PUBLIC_MODEL_RUNNER_API_URL || ""
};
