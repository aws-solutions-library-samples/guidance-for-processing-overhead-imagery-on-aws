"""
This module contains utility methods for the inference runbook.
"""

import json
import os
import subprocess
import time
import uuid
from typing import Dict, Any, List, Tuple

import boto3
import earthpy.plot as ep
import geopandas as gpd
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import rasterio
import s3fs
import yaml
from botocore.exceptions import ClientError
from fiona import Env, open as fiona_open
from pyogrio import read_dataframe
from rasterio.features import rasterize

# AWS Clients and S3 Filesystem
s3 = boto3.client("s3")
sqs = boto3.client("sqs")
s3_fs = s3fs.S3FileSystem(listings_expiry_time=1)
ecs_client = boto3.client("ecs")
sm = boto3.client('sagemaker')


# Constant to be used when defining SQS request to ModelRunner
IMAGE_REQUEST_TEMPLATE = """{
     "jobId": "test-job-id",
     "jobName": "test-job-name",
     "jobArn": "arn:aws:oversightml:us-east-1:12345678901:ipj/test-job-name",
     "imageUrls": ["s3://osml-test-images-12345678901/small.tif"],
     "outputs": [
        {"type": "S3", "bucket": "mr-bucket-sink-12345678901", "prefix": "output/test-job-name/"}
     ],
     "imageProcessor": {"name": "buildings-test-g4", "type": "SM_ENDPOINT"},
     "imageProcessorTileSize": 1024,
     "imageProcessorTileOverlap": 64,
     "imageProcessorTileFormat": "GTIFF",
     "imageProcessorTileCompression": "LZW"
  }"""

# Class to define ModelRunner ImageRequest status states
class ImageRequestStatus(str):
    """
    Enumeration defining status for image
    """

    STARTED = "STARTED"
    PARTIAL = "PARTIAL"
    IN_PROGRESS = "IN_PROGRESS"
    SUCCESS = "SUCCESS"
    FAILED = "FAILED"

def save_config_to_yaml(config: Dict[str, Any], output_file: str):
    """
    Saves a given configuration dictionary to a YAML file.

    :param config: The configuration dictionary to save.
    :param output_file: The file path where the YAML will be saved.
    :return: None
    """
    try:
        with open(output_file, 'w') as file:
            yaml.dump(config, file, default_flow_style=False)
        print(f"✅ Configuration saved to '{output_file}'")
    except Exception as e:
        print(f"❌ Failed to save configuration: {e}")
        raise

def create_sagemaker_endpoint(cfg: Dict[str, Any]) -> None:
    """
    Creates a SageMaker endpoint using the specified configuration.

    :param cfg: A dictionary containing the configuration for the SageMaker endpoint. 
                Must include 'model_endpoint_name' and 'model_endpoint_config_name'.
    """
    try:
        # Attempt to create the SageMaker endpoint
        sm.create_endpoint(
            EndpointName=cfg['model_endpoint_name'], 
            EndpointConfigName=cfg['model_endpoint_config_name']
        )
        print(f"✅ SageMaker endpoint '{cfg['model_endpoint_name']}' is being created successfully.")
    
    except sm.exceptions.ClientError as e:
        # Handle client errors and specific cases for already existing endpoints
        error_message = e.response['Error']['Message']
        if "Cannot create already existing endpoint" in error_message:
            print(f"⚠️ SageMaker endpoint '{cfg['model_endpoint_name']}' already exists.")
        else:
            print(f"❌ An error occurred while creating the endpoint: {error_message}")

def load_inference_config(cfg_file: str="inference_example_config.yaml"):
    """
    Load the inference configuration file.

    :param cfg_file: Path to the configuration YAML file.
    :return: Configuration dictionary.
    """
    with open(cfg_file) as f:
        cfg = yaml.safe_load(f)
    return cfg


def get_input_imagery(cfg: Dict[str, Any]) -> List[str]:
    """
    Retrieves input imagery based on the method specified in the configuration.

    Methods:
    - Area of Interest (AOI)
    - Years of public data
    - Single S3 folder
    - Single S3 file

    :param cfg: Configuration dictionary.
    :return: List of image paths.
    """
    print(f"Getting input data via {cfg['which_input_option']}")
    all_images = []

    match cfg["which_input_option"]:
        case "aoi":
            all_images = gather_inputs_aoi(cfg["imagery_meta_s3_uri"], cfg["aoi"])
        case "years":
            all_images = gather_inputs_years(cfg["imagery_bucket_s3"], cfg["years"])
        case "s3_path":
            s3_path = cfg["s3_path"]
            bucket = s3_path.split("/")[2]
            prefix = "/".join(s3_path.split("/")[3:])
            if s3_path.endswith("/"):
                all_images = get_all_s3_images(bucket, prefix)
            else:
                all_images = [s3_path]
        case _:
            print("❌ Unsupported input option. Check your configuration.")

    print(f"Found {len(all_images)} images to process.")
    return all_images


def get_all_s3_images(bucket_name: str, prefix: str) -> List[str]:
    """
    Retrieves all images in a specified S3 bucket and prefix.

    :param bucket_name: S3 bucket name (without `s3://`).
    :param prefix: S3 prefix (folder path).
    :return: List of image paths.
    """
    all_images = []
    print(f"Scanning s3://{bucket_name}/{prefix} ...")
    for page in s3.get_paginator("list_objects_v2").paginate(
            Bucket=bucket_name, Prefix=prefix, PaginationConfig={"PageSize": 1000}
    ):
        for obj in page.get("Contents", []):
            img = obj["Key"]
            if img.lower().endswith((".tif", ".tiff")):
                all_images.append(f"s3://{bucket_name}/{img}")

    print(f"Scan complete. Found {len(all_images)} images.")
    return all_images


def create_sqs_message(cfg: Dict[str, Any], list_of_images: List[str]) -> Dict[str, Any]:
    """
    Creates an SQS message for an inference job.

    :param cfg: Configuration dictionary.
    :param list_of_images: List of image S3 URIs.
    :return: SQS message as a dictionary.
    """
    msg = json.loads(IMAGE_REQUEST_TEMPLATE)
    msg["jobId"] = f"{cfg['jobId']}-{str(uuid.uuid4())[:12]}"
    msg["jobName"] = cfg["jobName"]
    msg["jobArn"] = f"arn:aws:oversightml:{cfg['region']}:{cfg['account']}:ipj/{cfg['jobName']}"
    msg["imageUrls"] = list_of_images
    msg["outputs"][0]["bucket"] = cfg["AOI_S3_output_bucket"]
    msg["outputs"][0]["prefix"] = f"{cfg['AOI_S3_output_prefix']}{cfg['jobName']}"
    msg["imageProcessor"]["name"] = cfg["model_endpoint_name"]
    msg["imageProcessorTileOverlap"] = cfg["tile_overlap"]
    return msg


def send_sqs_message(msg: Dict[str, Any]) -> Dict[str, Any]:
    """
    Sends an SQS message to the ImageRequestQueue.

    :param msg: SQS message as a dictionary.
    :return: Response from SQS send_message API.
    """
    queue_url = "ImageRequestQueue"
    response = sqs.send_message(QueueUrl=queue_url, MessageBody=json.dumps(msg))
    print(f"Message sent with ID: {response['MessageId']}")
    return response

def create_sqs_message_for_single_image(cfg: Dict[str, Any], single_image: str) -> Dict[str, Any]:

    msg = json.loads(IMAGE_REQUEST_TEMPLATE)
    msg["jobId"] = single_image.split('/')[-1].split('.')[0] # replacing jobid with image name to ease tracking
    msg["jobName"]=cfg["jobName"]
    msg["imageUrls"]=[single_image]
    msg["outputs"][0]["bucket"] = cfg["AOI_S3_output_bucket"]
    msg["outputs"][0]["prefix"] = cfg["AOI_S3_output_prefix"]+cfg["jobName"]
    msg["imageProcessor"]["name"]=cfg["model_endpoint_name"]
    msg["imageProcessorTileOverlap"] = cfg["tile_overlap"]

    return msg

def submit_all_images_for_processing(cfg: Dict[str, Any], all_images: List[str]) -> Dict[str, Dict[str, Any]]:
    """
    Submits all images for processing by creating and sending SQS messages.

    :param cfg: Configuration dictionary containing required parameters.
    :param all_images: List of image URLs to process.
    :return: Dictionary containing job status for each image.
    """
    job_status_dict = {}
    for img in all_images:
        msg = create_sqs_message_for_single_image(cfg, img)
        message_id = send_sqs_message(msg)
        job_status_dict[img] = {
            "image_url": img,
            "job_id": msg["jobId"],
            "message_id": message_id,
            "status": ImageRequestStatus.STARTED,
            "completed": False,
        }
    print(f"Submitted all {len(all_images)} images for processing.")
    return job_status_dict

def filter_geojson_with_threshold(cfg: Dict[str, Any], thresh: float, directory: str = "/home/ec2-user/SageMaker/inference/results") -> str:
    """
    Filters GeoJSON features based on a confidence score threshold.

    :param cfg: Configuration dictionary containing job information.
    :param thresh: Threshold value for filtering features.
    :param directory: Directory containing the input GeoJSON file and saving the output. Defaults to "/home/ec2-user/SageMaker/inference".
    :return: Path to the filtered GeoJSON file.
    """
    # Default directory to "/home/ec2-user/SageMaker/inference/results" if not specified
    os.makedirs(directory, exist_ok=True)

    # File paths
    all_results_filepath = os.path.join(directory, f"{cfg['jobName']}-total.geojson")
    thresholded_results_filepath = os.path.join(directory, f"{cfg['jobName']}-total-thresh-{thresh}.geojson")

    print(f"Filtering features in {all_results_filepath} with threshold > {thresh}")

    # Use Fiona to read and process the GeoJSON file
    with Env(OSR_WKT_FORMAT="WKT2_2018"):
        with fiona_open(all_results_filepath, mode="r") as geojson:
            # Define schema and CRS for output
            schema = geojson.schema
            crs = geojson.crs

            # Filtered features
            filtered_features = []
            dropped = 0

            for feature in geojson:
                # Access the score from the featureClasses attribute
                properties = feature['properties']
                feature_classes = (
                    json.loads(properties['featureClasses'])
                    if isinstance(properties['featureClasses'], str)
                    else properties['featureClasses']
                )

                # Apply threshold filter
                if feature_classes[0]['score'] > thresh:
                    filtered_features.append(feature)
                else:
                    dropped += 1

            print(f"Dropped {dropped} of {len(geojson)} features.")

            # Save filtered features to the output GeoJSON file
            with fiona_open(
                thresholded_results_filepath,
                mode="w",
                driver="GeoJSON",
                schema=schema,
                crs=crs
            ) as output:
                for filtered_feature in filtered_features:
                    output.write(filtered_feature)

    print(f"Filtered features saved to {thresholded_results_filepath}.")
    return thresholded_results_filepath


def gather_inputs_years(s3_bucket: str, years: List[str]) -> List[str]:
    """
    Gathers imagery paths from an S3 bucket for the specified years.

    :param s3_bucket: Name of the S3 bucket.
    :param years: List of years to query.
    :return: List of S3 URIs for the selected years.
    """
    inputs = []
    for year in years:
        if year == "2019":
            keys = [
                f"s3://{x}"
                for x in s3_fs.ls(f"{s3_bucket}/orthoimagery-program/tiles/{year}/cogs/jpeg")
                if ".tif" in x
            ]
        else:
            keys = [
                f"s3://{x}"
                for x in s3_fs.ls(f"{s3_bucket}/orthoimagery-program/tiles/{year}/cogs/4-band-deflate")
                if ".tif" in x
            ]
        inputs += keys
    return list(set(inputs))


def gather_inputs_aoi(imagery_meta_s3_uri, aoi_s3_uri):
    """
    Gathers imagery paths based on intersection with an AOI.

    :param imagery_meta_s3_uri: S3 URI of the imagery metadata.
    :param aoi_s3_uri: S3 URI of the AOI file.
    :return: List of S3 URIs for imagery that intersects the AOI.
    """
    imagery_meta_path = imagery_meta_s3_uri.replace("s3://", "").split("/")[-1]
    aoi_path = aoi_s3_uri.replace("s3://", "").split("/")[-1]

    imagery_command = f"aws s3 cp --recursive {imagery_meta_s3_uri} {imagery_meta_path}"
    aoi_command = f"aws s3 cp {aoi_s3_uri} ."

    # Download the shapefile and geojson file
    subprocess.run(imagery_command.split(" "))
    subprocess.run(aoi_command.split(" "))

    imagery = read_dataframe(os.path.join(imagery_meta_path, f"{imagery_meta_path}.shp"))
    aoi = read_dataframe(aoi_path).to_crs("epsg:6543")

    return [
        x.replace("s3://", "s3://")
        for x in gpd.sjoin(imagery, aoi, how="inner", predicate="intersects").file.unique().tolist()
    ]

def plot_inference_results(s3_uri: str, geojson_s3_uri: str, thresh: float, output_dir: str = "/home/ec2-user/SageMaker/inference/results") -> None:
    """
    Plots inference results by overlaying detected footprints on the raster image and saves artifacts locally.

    :param s3_uri: S3 URI of the raster image.
    :param geojson_s3_uri: S3 URI of the GeoJSON containing detected footprints.
    :param thresh: Confidence threshold for filtering detections.
    :param output_dir: Directory to save artifacts (plots and masks), defaults to "/home/ec2-user/SageMaker/inference".
    """
    os.makedirs(output_dir, exist_ok=True)
    masks_dir = os.path.join(output_dir, "masks")
    plots_dir = os.path.join(output_dir, "plots")
    os.makedirs(masks_dir, exist_ok=True)
    os.makedirs(plots_dir, exist_ok=True)

    print(f"Showing image {s3_uri} with footprints from {geojson_s3_uri} "
          f"and ignoring detections with confidence lower than {thresh}.")

    geojson_s3_path = geojson_s3_uri.replace("s3://", "")
    scene_raster = rasterio.open(s3_uri)
    fig, ax = plt.subplots(figsize=(12, 12))

    geojson_bucket = geojson_s3_path.split("/")[0]
    geojson_key = '/'.join(geojson_s3_path.split("/")[1:])
    geojson_local_path = os.path.join(output_dir, geojson_s3_path.split("/")[-1])
    
    if not os.path.isfile(geojson_local_path):
        s3.download_file(geojson_bucket, geojson_key, geojson_local_path)

    gdf = gpd.read_file(geojson_local_path).to_crs(scene_raster.crs)

    print(f"Filtering on threshold {thresh}")
    result = []
    dropped = 0
    for _, row in gdf.iterrows():
        feature_classes = json.loads(row['featureClasses']) if isinstance(row['featureClasses'], str) else row['featureClasses']
        if feature_classes[0]['score'] > thresh:
            result.append(row)
        else:
            dropped += 1
    print(f"Dropped {dropped} of {len(gdf)} features")

    filtered = pd.DataFrame(result)
    geom = filtered.geometry

    buildings_raster = rasterize(
        geom,
        out_shape=scene_raster.shape,
        transform=scene_raster.transform,
        fill=0,
        default_value=1,
        dtype=rasterio.uint8
    )

    mask_path = os.path.join(masks_dir, os.path.basename(s3_uri).replace(".tif", "_mask.tif"))
    with rasterio.open(
            mask_path, "w",
            driver="GTiff",
            crs=scene_raster.crs,
            transform=scene_raster.transform,
            dtype=rasterio.uint8,
            count=1,
            width=scene_raster.width,
            height=scene_raster.height
    ) as dst:
        dst.write(buildings_raster, indexes=1)

    # Plot raster and overlay mask
    ep.plot_rgb(scene_raster.read(), ax=ax, title=os.path.basename(s3_uri))
    ep.plot_bands(buildings_raster, alpha=0.5, ax=ax, cbar=False)
    ax.set_axis_off()

    plot_path = os.path.join(plots_dir, os.path.basename(s3_uri).replace(".tif", "_plot.png"))
    plt.savefig(plot_path, bbox_inches='tight')
    print(f"Saved plot to {plot_path}")
    plt.show()
    scene_raster.close()

def compare_inference_results(s3_uri: str, geojson1_s3_uri: str, geojson2_s3_uri: str) -> None:
    """
    Compares inference results by overlaying GeoJSON footprints on the raster image.

    :param s3_uri: S3 URI of the raster image.
    :param geojson1_s3_uri: S3 URI of the first GeoJSON file.
    :param geojson2_s3_uri: S3 URI of the second GeoJSON file.
    """
    os.makedirs("comparison_plots", exist_ok=True)

    def enhance_contrast(image: np.ndarray) -> np.ndarray:
        """Enhances contrast of an image by clipping to the 2nd–98th percentile."""
        lower, upper = np.percentile(image, (2, 98))
        clipped = np.clip(image, lower, upper)
        return ((clipped - lower) / (upper - lower) * 255).astype(np.uint8)

    def build_geojson_raster(geojson_s3_uri: str, raster: rasterio.io.DatasetReader, color: Tuple[int, int, int]) -> np.ndarray:
        """
        Builds a colored raster mask from a GeoJSON file.

        :param geojson_s3_uri: S3 URI of the GeoJSON file.
        :param raster: The rasterio dataset to align with.
        :param color: RGB color as a tuple, e.g., (255, 0, 0) for red.
        :return: 3-channel RGB mask.
        """
        geojson_s3_path = geojson_s3_uri.replace("s3://", "")
        geojson_bucket = geojson_s3_path.split("/")[0]
        geojson_key = '/'.join(geojson_s3_path.split("/")[1:])
        geojson_local_path = geojson_key.split("/")[-1]
        if not os.path.isfile(geojson_local_path):
            s3.download_file(geojson_bucket, geojson_key, geojson_local_path)

        gdf = gpd.read_file(geojson_local_path).to_crs(raster.crs)
        mask = rasterize(
            ((geom, 1) for geom in gdf.geometry),
            out_shape=raster.shape,
            transform=raster.transform,
            fill=0,
            dtype=np.uint8
        )

        rgb_mask = np.zeros((raster.height, raster.width, 3), dtype=np.uint8)
        for i, c in enumerate(color):
            rgb_mask[:, :, i] = np.where(mask == 1, c, 0)
        return rgb_mask

    def overlay_with_alpha(base_image: np.ndarray, mask: np.ndarray, alpha_value: float) -> np.ndarray:
        """
        Overlays a mask on the base image with transparency.

        :param base_image: Base image as a NumPy array (H, W, 3).
        :param mask: Mask image as a NumPy array (H, W, 3).
        :param alpha_value: Transparency level for the mask (0.0 to 1.0).
        :return: Image with overlay mask.
        """
        overlay = base_image.copy()
        mask_indices = mask.sum(axis=-1) > 0
        overlay[mask_indices] = (
                base_image[mask_indices] * (1 - alpha_value) + mask[mask_indices] * alpha_value
        )
        return overlay

    with rasterio.open(s3_uri) as scene_raster:
        scene_data = scene_raster.read([1, 2, 3]) if scene_raster.count >= 3 else np.repeat(scene_raster.read(1)[None, :, :], 3, axis=0)
        enhanced_scene_data = np.stack([enhance_contrast(band) for band in scene_data], axis=0)

    buildings_raster_1 = build_geojson_raster(geojson1_s3_uri, scene_raster, (0, 255, 0))  # Green
    buildings_raster_2 = build_geojson_raster(geojson2_s3_uri, scene_raster, (255, 0, 0))  # Red

    combined_image = np.moveaxis(enhanced_scene_data, 0, -1).astype(np.uint8)
    alpha = 0.6
    combined_image = overlay_with_alpha(combined_image, buildings_raster_2, alpha)
    combined_image = overlay_with_alpha(combined_image, buildings_raster_1, alpha)

    fig, ax = plt.subplots(figsize=(12, 12))
    ax.imshow(
        combined_image,
        extent=(scene_raster.bounds.left, scene_raster.bounds.right, scene_raster.bounds.bottom, scene_raster.bounds.top),
        origin="upper"
    )
    ax.set_axis_off()

    plot_path = f'comparison_plots/{os.path.basename(s3_uri).replace(".tif", "_comparison.png")}'
    plt.savefig(plot_path, bbox_inches="tight")
    print(f"Saved plot to {plot_path}")
    plt.show()


def get_geojson_name_for(cfg: Dict[str, Any], img: str) -> str:
    """
    Constructs the S3 path for a GeoJSON file corresponding to a given image.

    :param cfg: Configuration dictionary containing job parameters.
    :param img: Image filename.
    :return: S3 path of the corresponding GeoJSON file.
    """
    return f"{cfg['AOI_S3_output_bucket']}/{cfg['AOI_S3_output_prefix']}{cfg['jobName']}/{os.path.basename(img).split('.')[0]}.geojson"

def get_job_progress_from_s3(cfg: Dict[str, Any], all_images: List[str]) -> None:
    """
    Checks the progress of a job by querying S3 for GeoJSON results.

    :param cfg: Configuration dictionary containing S3 bucket and prefix information.
    :param all_images: List of all image file paths being processed.
    """
    s3_bucket = cfg["AOI_S3_output_bucket"]
    s3_prefix = f"{cfg['AOI_S3_output_prefix']}{cfg['jobName']}"

    print(f"Checking for GeoJSON results at {s3_bucket}/{s3_prefix}")

    all_results = [
        f"s3://{x}" for x in s3_fs.ls(f"{s3_bucket}/{s3_prefix}")
        if ".geojson" in x and "-total" not in x
    ]

    print(f"{len(all_results)} processed out of {len(all_images)} images total")

    if all_results:
        if (len(all_results) / len(all_images)) >= 1:
            print("Job complete! We may proceed with aggregation and post-processing.")

def check_images_done(job_status_dict: Dict[str, Dict[str, Any]]) -> bool:
    """
    Checks if all images in the job status dictionary are processed.

    :param job_status_dict: Dictionary containing the processing status of images.
    :return: True if all images are processed, otherwise False.
    """
    total_images_processed = sum(value["completed"] for value in job_status_dict.values())
    return total_images_processed == len(job_status_dict)

def save_geojson_as_shapefile(cfg: Dict[str, Any], thresh: float, filtered_geojson_file: str, directory: str = None) -> None:
    """
    Saves a filtered GeoJSON file as a shapefile.

    :param cfg: Configuration dictionary containing job name information.
    :param thresh: Threshold value used for filtering.
    :param filtered_geojson_file: Path to the filtered GeoJSON file.
    :param directory: Directory to save the output Shapefile. Defaults to the directory containing the filtered GeoJSON file.
    """
    # Default to the directory of the filtered GeoJSON file if not specified
    if directory is None:
        directory = os.path.dirname(filtered_geojson_file)
    os.makedirs(directory, exist_ok=True)

    # Construct output Shapefile path
    filtered_shapefile = os.path.join(directory, f"{cfg['jobName']}-total-thresh-{thresh}.shp")

    # Using Fiona's environment to ensure proper configuration
    with Env(OSR_WKT_FORMAT="WKT2_2018"):
        # Open the original GeoJSON file
        with fiona_open(filtered_geojson_file, mode="r") as geojson:
            # Extract CRS from GeoJSON
            crs = geojson.crs or "EPSG:4326"  # Use GeoJSON CRS or default to WGS84

            # Define the schema based on GeoJSON properties and geometry type
            schema = {
                'geometry': 'Polygon',
                'properties': {
                    'id': 'str',
                    'score': 'float',
                    'center_lon': 'float',
                    'center_lat': 'float',
                },
            }

            # Open a new Shapefile for writing
            with fiona_open(
                filtered_shapefile,
                mode="w",
                driver="ESRI Shapefile",
                schema=schema,
                crs=crs
            ) as shapefile:
                for feature in geojson:
                    # Extract relevant properties and flatten nested structures
                    properties = feature['properties']
                    shapefile.write({
                        'type': 'Feature',
                        'geometry': feature['geometry'],
                        'properties': {
                            'id': properties['id'],
                            'score': properties['featureClasses'][0]['score'],
                            'center_lon': properties.get('center_longitude', None),
                            'center_lat': properties.get('center_latitude', None),
                        },
                    })

    print(f"\nSaved {filtered_geojson_file} as shapefile {filtered_shapefile} "
          f"and supporting files. See JupyterLab file browser.")

def merge_and_save_results(cfg: Dict[str, Any]) -> None:
    """
    Merges GeoJSON results directly from S3, saves the merged result locally, and uploads it back to S3.

    :param cfg: Configuration dictionary containing S3 bucket and job details.
    """
    s3_bucket = cfg["AOI_S3_output_bucket"]
    s3_prefix = f"{cfg['AOI_S3_output_prefix']}{cfg['jobName']}"
    all_results_filename = f"{cfg['jobName']}-total.geojson"

    print(f"Merging results for {s3_prefix}...")

    all_results = [
        f"s3://{x}" for x in s3_fs.ls(f"{s3_bucket}/{s3_prefix}")
        if ".geojson" in x and "-total" not in x
    ]

    # Merge all results into a single GeoDataFrame
    merge = gpd.GeoDataFrame()
    for res in all_results:
        tmp = gpd.read_file(res)
        merge = pd.concat([merge, tmp], ignore_index=True)

    # Save the merged result locally and to S3
    s3_all_results_filename = f"s3://{s3_bucket}/{s3_prefix}/{all_results_filename}"
    merge.to_file(all_results_filename, driver="GeoJSON")
    print(f"Saved locally as {all_results_filename}")

    merge.to_file(s3_all_results_filename, driver="GeoJSON")
    print(f"Saved to S3 as {s3_all_results_filename}")


def merge_and_save_results_local(cfg: Dict[str, Any], local_dir: str = "/home/ec2-user/SageMaker/inference") -> None:
    """
    Copies GeoJSON results from S3 to a local folder, merges them, and saves the result locally and back to S3.

    :param cfg: Configuration dictionary containing S3 bucket and job details.
    :param local_dir: Directory to save the merged GeoJSON file locally. Defaults to "/home/ec2-user/SageMaker/inference".
    """
    s3_bucket = cfg["AOI_S3_output_bucket"]
    s3_prefix = f"{cfg['AOI_S3_output_prefix']}{cfg['jobName']}"
    all_results_filename = f"{cfg['jobName']}-total.geojson"
    local_filepath = os.path.join(local_dir, "results", all_results_filename)  # Construct file path

    print(f"Merging results for {s3_prefix}...")
    print(f"Saving merged results to local directory: {local_dir}")

    # Ensure the local directory exists
    os.makedirs(local_dir, exist_ok=True)

    # Sync GeoJSON results from S3 to the local directory
    results_dir = os.path.join(local_dir, "results")
    os.makedirs(results_dir, exist_ok=True)  # Create a "results" subdirectory
    print(f"Copying GeoJSON results from S3 to local folder: {results_dir}")
    sync_command = (
        f"aws s3 sync --include '*.geojson' --exclude '*total.geojson' --quiet "
        f"s3://{s3_bucket}/{s3_prefix} {results_dir}/"
    )
    subprocess.run(sync_command, shell=True)

    # Merge all local GeoJSON results into a single GeoDataFrame
    merge = gpd.GeoDataFrame()
    all_results = [
        os.path.join(results_dir, f) for f in os.listdir(results_dir) if f.endswith(".geojson")
    ]
    for i, res in enumerate(all_results, 1):
        if i % 100 == 0:
            print(f"Processed {i} files")
        tmp = gpd.read_file(res).to_crs("epsg:4326")
        merge = pd.concat([merge, tmp], ignore_index=True)

    print("All results aggregated into a single GeoJSON.")

    # Save the merged result locally
    merge.to_file(local_filepath, driver="GeoJSON")
    print(f"Saved locally as {local_filepath}")

    # Upload the merged result back to S3
    s3_all_results_filepath = f"s3://{s3_bucket}/{s3_prefix}/{all_results_filename}"
    upload_command = f"aws s3 cp {local_filepath} {s3_all_results_filepath}"
    subprocess.run(upload_command, shell=True)
    print(f"Saved to S3 as {s3_all_results_filepath}")


def update_modelrunner_tasks(cfg: Dict[str, Any], num_desired_tasks: int = None) -> None:
    """
    Updates the desired task count for the ECS model runner service.

    :param cfg: Configuration dictionary containing ECS cluster and service details.
    :param num_desired_tasks: Desired number of tasks to run. Defaults to the value in the configuration.
    """
    num_desired_tasks = num_desired_tasks or cfg["modelrunner_task_count"]
    print(f"Changing model runner capacity to {num_desired_tasks} tasks.")

    ecs_client.update_service(
        cluster=cfg["modelrunner_cluster_name"],
        service=cfg["modelrunner_service_name"],
        desiredCount=num_desired_tasks
    )

def wait_for_endpoint(endpoint_name: str, sm_client: boto3.client, check_interval: int = 30, timeout_minutes: int = 30) -> None:
    """
    Polls the SageMaker endpoint status until it becomes ready (InService), fails, or times out.

    :param endpoint_name: Name of the SageMaker endpoint.
    :param sm_client: Boto3 SageMaker client.
    :param check_interval: Time (in seconds) to wait between status checks. Default is 30 seconds.
    :param timeout_minutes: Maximum time (in minutes) to wait for the endpoint to become ready. Default is 30 minutes.
    """
    print(f"Checking status of endpoint: {endpoint_name}")

    start_time = time.time()
    timeout_seconds = timeout_minutes * 60

    while True:
        # Get the endpoint status
        response = sm_client.describe_endpoint(EndpointName=endpoint_name)
        status = response['EndpointStatus']
        print(f"Current Status: {status}")

        if status == 'InService':
            print("✅ Endpoint is ready and InService.")
            break
        elif status == 'Failed':
            print("❌ Endpoint creation failed. Check the SageMaker logs for details.")
            break

        # Check for timeout
        elapsed_time = time.time() - start_time
        if elapsed_time > timeout_seconds:
            print(f"⏳ Timeout reached ({timeout_minutes} minutes). Exiting status check.")
            break

        # Wait before the next check
        print(f"Waiting for endpoint to be ready... (Checking again in {check_interval} seconds)")
        time.sleep(check_interval)

def delete_sagemaker_endpoint(endpoint_name: str, sm_client=None):
    """
    Deletes a SageMaker endpoint by name.

    :param endpoint_name: Name of the SageMaker endpoint to delete.
    :param sm_client: Optional SageMaker client instance. If not provided, a new client is created.
    :return: None
    """
    try:
        # Attempt to delete the endpoint
        sm_client.delete_endpoint(EndpointName=endpoint_name)
        print(f"✅ SageMaker endpoint '{endpoint_name}' has been deleted.")
    except ClientError as e:
        # Handle specific error scenarios
        error_code = e.response['Error']['Code']
        if error_code == 'ValidationException':
            print(f"⚠️ Endpoint '{endpoint_name}' does not exist or has already been deleted.")
        else:
            print(f"❌ An unexpected error occurred: {e}")
            raise

def wait_for_job_completion(cfg: Dict[str, str], all_images: List[str], check_interval: int = 30, timeout_minutes: int = 30) -> bool:
    """
    Waits for a job to complete by monitoring the number of processed GeoJSON files in S3.

    :param cfg: Configuration dictionary containing S3 bucket and prefix details.
    :param all_images: List of input images.
    :param check_interval: Time (in seconds) to wait between checks. Default is 60 seconds.
    :param timeout_minutes: Maximum time (in minutes) to wait for the job to complete. Default is 30 minutes.
    :return: True if the job completes within the timeout, False otherwise.
    """
    start_time = time.time()
    timeout_seconds = timeout_minutes * 60
    s3_bucket = cfg["AOI_S3_output_bucket"]
    s3_prefix = f"{cfg['AOI_S3_output_prefix']}{cfg['jobName']}"

    print(f"Monitoring job progress at S3 path: {s3_bucket}/{s3_prefix}")

    while True:
        # Fetch the list of GeoJSON results
        all_results = [
            f"s3://{x}" for x in s3_fs.ls(f"{s3_bucket}/{s3_prefix}")
            if ".geojson" in x and "-total" not in x
        ]

        # Print progress
        print(f"{len(all_results)} processed out of {len(all_images)} images total")

        # Check if the job is complete
        if len(all_results) > 0 and (len(all_results) / len(all_images)) >= 1:
            print("✅ Job complete! You may proceed with aggregation and post-processing.")
            return True

        # Check for timeout
        elapsed_time = time.time() - start_time
        if elapsed_time > timeout_seconds:
            print(f"⏳ Timeout reached ({timeout_minutes} minutes). Job did not complete.")
            return False

        # Wait before checking again
        print(f"Waiting for {check_interval} seconds before checking again...")
        time.sleep(check_interval)
        