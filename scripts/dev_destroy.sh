#!/bin/bash

# Copyright 2024 Amazon.com, Inc. or its affiliates.

# Script to destroy specific OSML CDK stacks.

print_banner() {
    echo "==============================="
    echo "   Destroying OSML Stacks      "
    echo "==============================="
}

print_completion_message() {
    echo "==============================="
    echo "  CDK Stack Destroy Completed  "
    echo "          All done!            "
    echo "==============================="
}

# List and filter stacks for destruction
list_and_filter_stacks() {
    local stack_pattern=".*Test-Imagery.*|.*TileServer.*|.*Test-ModelEndpoints.*|.*ModelRunner.*|.*DataIntake.*|.*DataCatalog.*"
    cdk list | sort -r | grep -E "$stack_pattern" > stack_list.txt
}

# Perform AWS CloudFormation deletion for all matching stacks
delete_cloudformation_stacks() {
    echo "Initiating AWS CloudFormation delete-stack in parallel for OSML component stacks..."
    while IFS= read -r stack_name; do
        (
            echo "Deleting CloudFormation stack: $stack_name"
            if aws cloudformation delete-stack --stack-name "$stack_name"; then
                echo "Completed deletion of stack: $stack_name"
            else
                echo "Failed to delete stack: $stack_name"
            fi
        ) &
    done < stack_list.txt

    # Wait for all background jobs to complete
    echo "Waiting for delete-stack commands to completed..."
    wait
    echo "All CloudFormation delete-stack commands completed."
}

# Destroy CDK stacks
cdk_destroy() {
    echo "Starting CDK stack destruction to clean up remaining stacks..."
    cdk destroy --all --force
}

# Main script logic
main() {
    print_banner

    echo "Listing and filtering stacks for destruction..."
    list_and_filter_stacks

    if [[ -s stack_list.txt ]]; then
        delete_cloudformation_stacks
        cdk_destroy
        print_completion_message
    else
        echo "No stacks found matching the criteria."
    fi

    # Cleanup
    rm -f stack_list.txt
}

# Execute the script
main
