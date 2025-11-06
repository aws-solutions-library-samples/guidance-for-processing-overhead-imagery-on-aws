#!/bin/bash
#
# Copyright 2024-2025 Amazon.com, Inc. or its affiliates.
#

set -e  # Exit immediately if a command exits with a non-zero status
set -o pipefail  # Exit if any part of a pipeline fails

# Configuration
DEFAULT_TIMEOUT_MINUTES=15

print_banner() {
    echo "=========================================="
    echo "  Running Model Runner Integration Tests  "
    echo "=========================================="
    echo "Timeout per test: ${DEFAULT_TIMEOUT_MINUTES} minutes"
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

# Function to run a test with timeout configuration
run_test() {
    local description=$1
    local image=$2
    local model=$3
    local region=$4
    local timeout_minutes=${5:-$DEFAULT_TIMEOUT_MINUTES}
    local tileSize="${5:-512}"
    local tileOverlap="${6:-128}"

    echo "=========================================="
    echo "Running: $description"
    echo "Image: $image"
    echo "Model: $model"
    echo "Region: $region"
    echo "Timeout: ${timeout_minutes} minutes"
    echo "Tile Size: ${tileSize}"
    echo "Tile Overlap: ${tileOverlap}"
    echo "=========================================="

    # Set timeout environment variable for the Python script
    export TEST_TIMEOUT_MINUTES=$timeout_minutes

    if python lib/osml-model-runner-test/bin/process_image.py --image "$image" --model "$model" --region "$region" --tile_size "$tileSize" --tile_overlap "$tileOverlap"; then
        echo "=========================================="
        echo "✓ $description: SUCCESS"
        echo "=========================================="
    else
        print_test_failed
        echo "Error: $description failed."
        echo "This may indicate a timeout issue or infrastructure problem."
        exit 1
    fi
}

# Check AWS_REGION, aws configure, then AWS_DEFAULT_REGION to determine the region.
# If none are set, prompt the user for the AWS_REGION.
if [ -z "$AWS_REGION" ]; then
    {
        AWS_REGION=$(aws configure get region)
    } || {
        if [ -n "$AWS_DEFAULT_REGION" ]; then
            AWS_REGION=$AWS_DEFAULT_REGION
        else
            read -p "Could not find region. Enter the AWS region (ex. us-west-2): " user_region
            if [ -n "$user_region" ]; then
                AWS_REGION=$user_region
            else
                echo "ERROR: AWS region is required."
                exit 1
            fi
        fi
    }
fi

# Run all desired model runner tests sequentially
print_banner

# All tests use the default timeout
run_test "Run small.tif against centerpoint model" "small" "centerpoint" $AWS_REGION
run_test "Run meta.ntf against centerpoint model" "meta" "centerpoint" $AWS_REGION
run_test "Run large.tif against flood model" "large" "flood" $AWS_REGION
run_test "Run tile.ntf against aircraft model" "tile_ntf" "aircraft" $AWS_REGION
run_test "Run tile.tif against aircraft model" "tile_tif" "aircraft" $AWS_REGION
run_test "Run sicd-capella-chip.ntf against centerpoint model" "sicd_capella_chip_ntf" "centerpoint" $AWS_REGION
run_test "Run sicd-umbra-chip.ntf against centerpoint model" "sicd_umbra_chip_ntf" "centerpoint" $AWS_REGION
run_test "Run sicd-interferometric-hh.nitf against centerpoint model" "sicd_interferometric_hh_ntf" "centerpoint" $AWS_REGION
run_test "Run wbid.nitf against centerpoint model" "wbid" "centerpoint" $AWS_REGION
run_test "Run small.tif against multi-container endpoint" "small" "multi-container" $AWS_REGION

run_test "Run failure_model_checker_tile.tif against failure model" "failure_model_checker_tile" "failure" $AWS_DEFAULT_REGION "512" "0"

print_test_passed

exit 0
