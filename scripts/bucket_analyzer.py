#  Copyright 2023-2024 Amazon.com, Inc. or its affiliates.

import argparse

import boto3
import matplotlib.pyplot as plt
from osgeo import gdal
from tqdm import tqdm


class S3BucketAnalyzer:
    """
    A class to analyze statistics of an S3 bucket.

    :param bucket_name: Name of the S3 bucket
    :type bucket_name: str
    """

    def __init__(self, bucket_name):
        self.bucket_name = bucket_name
        self.s3 = boto3.client("s3")

    def get_statistics(self):
        """
        Get statistics for the S3 bucket.

        :return: A dictionary with statistics about the S3 bucket
        :rtype: dict
        """
        paginator = self.s3.get_paginator("list_objects_v2")

        total_objects = 0
        total_size = 0
        extensions_count = {}
        compression_types_count = {}
        total_bands = 0
        bands_list = []
        largest_object = {"Key": None, "Size": 0}
        smallest_object = {"Key": None, "Size": float("inf")}
        most_bands = {"Key": None, "Bands": 0}
        fewest_bands = {"Key": None, "Bands": float("inf")}
        sizes = []

        # First, count the total number of objects to set up the progress bar
        object_count = sum(1 for _ in paginator.paginate(Bucket=self.bucket_name))

        with tqdm(total=object_count, desc="Processing objects") as pbar:
            for page in paginator.paginate(Bucket=self.bucket_name):
                for obj in page.get("Contents", []):
                    total_objects += 1
                    size = obj["Size"]
                    sizes.append(size)
                    total_size += size

                    # Determine the file extension
                    key = obj["Key"]
                    extension = key.split(".")[-1].lower() if "." in key else ""
                    if extension in extensions_count:
                        extensions_count[extension] += 1
                    else:
                        extensions_count[extension] = 1

                    # Get compression type and number of bands using GDAL
                    try:
                        file_path = f"/vsis3/{self.bucket_name}/{key}"
                        dataset = gdal.Open(file_path)
                        if dataset:
                            metadata = dataset.GetMetadata()
                            compression_type = (
                                dataset.GetMetadataItem("COMPRESSION")
                                or metadata.get("COMPRESSION")
                                or metadata.get("COMPRESSION_TYPE")
                                or metadata.get("TIFFTAG_COMPRESSION")
                                or metadata.get("IMAGE_STRUCTURE", {}).get("COMPRESSION")
                            )
                            if compression_type:
                                if compression_type in compression_types_count:
                                    compression_types_count[compression_type] += 1
                                else:
                                    compression_types_count[compression_type] = 1

                            bands = dataset.RasterCount
                            total_bands += bands
                            bands_list.append(bands)

                            if bands > most_bands["Bands"]:
                                most_bands = {"Key": key, "Bands": bands}
                            if bands < fewest_bands["Bands"]:
                                fewest_bands = {"Key": key, "Bands": bands}
                        else:
                            print(f"GDAL could not open file {key}")
                    except Exception as e:
                        print(f"Error processing {key}: {e}")

                    # Check for largest object
                    if size > largest_object["Size"]:
                        largest_object = {"Key": key, "Size": size}

                    # Check for the smallest object
                    if smallest_object["Size"] > size > 0:
                        smallest_object = {"Key": key, "Size": size}

                    pbar.update(1)

        average_size = total_size / total_objects if total_objects > 0 else 0
        average_bands = total_bands / total_objects if total_objects > 0 else 0

        # Convert sizes to GB
        total_size_gb = total_size / (1024**3)
        average_size_gb = average_size / (1024**3)
        largest_object_gb = largest_object["Size"] / (1024**3)
        smallest_object_gb = smallest_object["Size"] / (1024**3)
        sizes_gb = [size / (1024**3) for size in sizes]

        return {
            "TotalObjects": total_objects,
            "AverageSizeGB": average_size_gb,
            "TotalSizeGB": total_size_gb,
            "ExtensionsCount": extensions_count,
            "CompressionTypesCount": compression_types_count,
            "TotalBands": total_bands,
            "AverageBands": average_bands,
            "MostBands": most_bands,
            "FewestBands": fewest_bands,
            "LargestObject": {"Key": largest_object["Key"], "SizeGB": largest_object_gb},
            "SmallestObject": {"Key": smallest_object["Key"], "SizeGB": smallest_object_gb},
            "SizesGB": sizes_gb,
        }

    @staticmethod
    def plot_histogram(sizes_gb):
        """
        Plot a histogram of object sizes in the S3 bucket.

        :param sizes_gb: List of object sizes in GB
        :type sizes_gb: list
        """
        plt.figure(figsize=(10, 6))
        plt.hist(sizes_gb, bins=50, edgecolor="black", alpha=0.75)
        plt.title("Histogram of Object Sizes in S3 Bucket")
        plt.xlabel("Size (GB)")
        plt.ylabel("Number of Objects")
        plt.grid(axis="y", alpha=0.75)
        plt.axvline(sum(sizes_gb) / len(sizes_gb), color="red", linestyle="dashed", linewidth=1, label="Average Size")
        plt.legend()
        plt.tight_layout()
        plt.show()

    @staticmethod
    def print_statistics(stats):
        """
        Print statistics of the S3 bucket.

        :param stats: Dictionary of statistics
        :type stats: dict
        """
        print(f"Total number of objects in bucket: {stats['TotalObjects']}")
        print(f"Average size of an object in the bucket: {stats['AverageSizeGB']} GB")
        print(f"Total size of all objects in bucket: {stats['TotalSizeGB']} GB")
        print("Count of each object file extension in bucket:")
        for ext, count in stats["ExtensionsCount"].items():
            print(f"  {ext}: {count}")
        print("Compression types in bucket:")
        for comp, count in stats["CompressionTypesCount"].items():
            print(f"  {comp}: {count}")
        print(f"Total number of bands in bucket: {stats['TotalBands']}")
        print(f"Average number of bands per image: {stats['AverageBands']}")
        print(f"Image with most bands: {stats['MostBands']['Key']} ({stats['MostBands']['Bands']} bands)")
        print(f"Image with fewest bands: {stats['FewestBands']['Key']} ({stats['FewestBands']['Bands']} bands)")
        print(f"Largest object in bucket: {stats['LargestObject']['Key']} ({stats['LargestObject']['SizeGB']} GB)")
        print(f"Smallest object in bucket: {stats['SmallestObject']['Key']} ({stats['SmallestObject']['SizeGB']} GB)")


def main():
    """
    Main function to run the S3 bucket analyzer as a CLI tool.
    """
    parser = argparse.ArgumentParser(description="Analyze statistics of an S3 bucket.")
    parser.add_argument("--bucket_name", type=str, required=True, help="Name of the S3 bucket")
    parser.add_argument("--histogram", action="store_true", help="Plot histogram of object sizes")
    args = parser.parse_args()

    analyzer = S3BucketAnalyzer(args.bucket_name)
    stats = analyzer.get_statistics()

    analyzer.print_statistics(stats)

    if args.histogram:
        analyzer.plot_histogram(stats["SizesGB"])


if __name__ == "__main__":
    main()
