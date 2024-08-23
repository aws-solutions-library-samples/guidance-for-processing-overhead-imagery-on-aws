#!/bin/bash

set -e  # Exit immediately if a command exits with a non-zero status
set -o pipefail  # Exit if any part of a pipeline fails

print_banner() {
    echo "=========================================="
    echo "  Running Tile Server Integration Tests   "
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

# Function to handle errors
handle_error() {
    echo "ERROR: An error occurred during the script execution."
    exit 1
}

# Trap errors and call the handle_error function
trap 'handle_error' ERR

# Grab the account id for the loaded AWS credentials
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

# Check if the account ID was successfully retrieved
if [ -z "$ACCOUNT_ID" ]; then
    echo "ERROR: Failed to retrieve AWS Account ID."
    exit 1
fi

# Check if the account ID was successfully retrieved
if [ -z "$AWS_REGION" ]; then
    {
        AWS_REGION=$(aws configure get region)
    } || {
        echo "ERROR: Failed to get AWS_REGION ENV variable."
        exit 1
    }
fi

# Print the starting banner
print_banner

# Creat the lambda test payload
echo "{\"image_uri\": \"s3://osml-test-images-$ACCOUNT_ID/small.tif\"}" > tmp_payload.json

echo "Invoking the Lambda function 'TSTestRunner' with payload from 'payload.json' in the region '$AWS_REGION'..."

# Invoke the Lambda function with the payload
log_result=$(aws lambda invoke --region "$AWS_REGION" \
                               --function-name "TSTestRunner" \
                               --payload fileb://tmp_payload.json \
                               --log-type Tail /dev/null \
                               --cli-read-timeout 0 \
                               --query 'LogResult' \
                               --output text | base64 --decode)

# Clean up the temporary payload file
rm tmp_payload.json

# Decode the log result and check for success
if echo "$log_result" | grep -q "Success: 100.00%"; then
    print_test_passed
    exit 0
else
    print_test_failed
    echo "$log_result"
    exit 1
fi
