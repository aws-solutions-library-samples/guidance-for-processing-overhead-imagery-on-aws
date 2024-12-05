#!/bin/sh
#
# Copyright 2024 Amazon.com, Inc. or its affiliates.
#

print_banner() {
    echo "==============================="
    echo "   Destroying OSML Stacks       "
    echo "==============================="
}


print_completion_message() {
    echo "==============================="
    echo "  CDK Stack Destroy Completed   "
    echo "==============================="
    echo "          All done!             "
    echo "==============================="
}

# Function to display usage information
usage() {
    echo "Usage: $0 <full|minimal>"
    exit 1
}

# Function to list all stacks
list_all_stacks() {
    cdk list | sort -r > stack_list.txt
}

# Function to list and destroy minimal stacks
destroy_minimal_stacks() {
    echo "Executing minimal action..."

    local STACK_LIST=".*TileServer.*|.*Test-ModelEndpoints.*|.*ModelRunner.*|.*DataIntake.*|.*DataCatalog.*"
    cdk list | sort -r | grep -E "$STACK_LIST" > stack_list.txt

    # This is to speed up the AWS CloudFormation delete-stack
    # so we can start deleting all stacks at once
    echo "Performing AWS CloudFormation delete-stack for matching stacks..."
    for stack_name in $(cat stack_list.txt); do
        if [[ "$stack_name" =~ $STACK_LIST ]]; then
            echo "Deleting CloudFormation stack $stack_name..."
            aws cloudformation delete-stack --stack-name "$stack_name"
        fi
    done

    for stack_name in $(cat stack_list.txt); do
        echo "Destroying stack $stack_name..."
        cdk destroy "$stack_name" --force
    done

    print_completion_message
    exit 0
}


# Function to destroy all stacks in sequence
destroy_all_stacks() {
    echo "Executing full destroy action..."
    cdk destroy --all --force
    print_completion_message
    exit 0
}

# Main script logic

# Check if the user provided an argument
if [ -z "$1" ]; then
    usage
fi

# Determine the action based on the user input
if [ "$1" = "full" ]; then
    destroy_all_stacks
elif [ "$1" = "minimal" ]; then
    destroy_minimal_stacks
else
    usage
fi

exit 1
