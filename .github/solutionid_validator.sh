#!/bin/bash

# Exit immediately if any command exits with a non-zero status
set -euo pipefail

# Function to display usage information
usage() {
    echo "Usage: $0 <solution_id>"
    echo "Example: $0 ABC123"
    exit 1
}

# Ensure a solution ID is provided as an argument
if [ "$#" -ne 1 ]; then
    echo "Error: Missing solution ID."
    usage
fi

# Assign the solution ID to a variable
SOLUTION_ID="$1"

# Output a message about what the script is checking
echo "Checking for solution ID: $SOLUTION_ID"

# Perform the search, excluding the '.github' directory
SEARCH_RESULT=$(grep -nr --exclude-dir='.github' "$SOLUTION_ID" ./.. || true)

# Check if the search result is non-empty
if [ -n "$SEARCH_RESULT" ]; then
    echo -e "Solution ID '$SOLUTION_ID' found:\n"
    echo "$SEARCH_RESULT"
    exit 0
else
    echo "Solution ID '$SOLUTION_ID' not found."
    exit 1
fi
