#!/bin/bash
#
# Copyright 2024 Amazon.com, Inc. or its affiliates.
#

set -e  # Exit immediately if a command exits with a non-zero status
set -o pipefail  # Exit if any part of a pipeline fails

print_banner() {
    echo "=========================================="
    echo "  Running Model Runner Integration Tests  "
    echo "=========================================="
}

print_test_passed() {
    echo "=========================================="
    echo "       Integration Tests Completed        "
    echo "=========================================="
    echo "            All tests passed!             "
    echo "=========================================="
}

print_test_failed() {
    echo "=========================================="
    echo "        Integration Tests Failed          "
    echo "=========================================="
    echo "        Some tests did not pass!          "
    echo "=========================================="
}

# Function to run a test and check its result
run_test() {
    local description=$1
    local image=$2
    local model=$3
    local region=$4

    echo "$description..."
    python3 lib/osml-model-runner-test/bin/process_image.py --image "$image" --model "$model" --region "$region"

    if [ $? -ne 0 ]; then
        print_test_failed
        echo "Error: $description failed."
        echo "Output:"
        exit 1
    fi

    # Clean up temporary output file if test succeeds
    echo "...success!"
}

if [ -z "$AWS_DEFAULT_REGION" ]; then
    AWS_DEFAULT_REGION=$(aws configure get region) || {
        echo "ERROR: AWS region is required."
        exit 1
    }
fi

# Run all desired model runner tests sequentially
print_banner

run_test "Run small.tif against centerpoint model" "small" "centerpoint" $AWS_DEFAULT_REGION

run_test "Run meta.ntf against centerpoint model" "meta" "centerpoint" $AWS_DEFAULT_REGION

run_test "Run large.tif against flood model" "large" "flood" $AWS_DEFAULT_REGION

run_test "Run tile.ntf against aircraft model" "tile_ntf" "aircraft" $AWS_DEFAULT_REGION

run_test "Run tile.tif against aircraft model" "tile_tif" "aircraft" $AWS_DEFAULT_REGION

run_test "Run sicd-capella-chip.ntf against centerpoint model" "sicd_capella_chip_ntf" "centerpoint" $AWS_DEFAULT_REGION

run_test "Run sicd-umbra-chip.ntf against centerpoint model" "sicd_umbra_chip_ntf" "centerpoint" $AWS_DEFAULT_REGION

run_test "Run sicd-interferometric-hh.nitf against centerpoint model" "sicd_interferometric_hh_ntf" "centerpoint" $AWS_DEFAULT_REGION

run_test "Run wbid.nitf against centerpoint model" "wbid" "centerpoint" $AWS_DEFAULT_REGION

print_test_passed

exit 0
