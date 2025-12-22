#!/bin/bash
#
# Copyright 2023-2024 Amazon.com, Inc. or its affiliates.
#

echo "   ___                    _       _     _            __  ";
echo "  /_____   _____ _ __ ___(_) __ _| |__ | |_  /\/\   / /  ";
echo " //  /\ \ / / _ | '__/ __| |/ _\` | '_ \| __|/    \ / /   ";
echo "/ \_// \ V |  __| |  \__ | | (_| | | | | |_/ /\/\ / /___ ";
echo "\___/   \_/ \___|_|  |___|_|\__, |_| |_|\__\/    \\____/ ";
echo "                            |___/                        ";
echo "   ___   _                         ___                  ___              ";
echo "  / __| | |  ___   __ _   _ _     |   \   ___  __ __   | __|  _ _   __ __";
echo " | (__  | | / -_) / _\` | | ' \    | |) | / -_) \ V /   | _|  | ' \  \ V /";
echo "  \___| |_| \___| \__,_| |_||_|   |___/  \___|  \_/    |___| |_||_|  \_/ ";
echo "                                                                         ";

# Navigate to root directory of this package
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${ROOT_DIR}" || exit 1

echo "=== Cleaning root project ==="

echo "Removing dist folder..."
rm -rf dist

echo "Removing cdk.out folder..."
rm -rf cdk.out

echo "Removing aws_lambda.bundle*..."
rm -rf aws_lambda.bundle*

echo "Removing node_modules folder..."
rm -rf node_modules

echo ""
echo "=== Cleaning lib/ components ==="

# Clean each component's CDK directory under lib/
for component_dir in lib/*/; do
    if [[ -d "${component_dir}cdk" ]]; then
        component_name=$(basename "${component_dir}")
        echo "Cleaning ${component_name}..."
        
        # Remove CDK build artifacts
        if [[ -d "${component_dir}cdk/cdk.out" ]]; then
            echo "  Removing cdk.out..."
            rm -rf "${component_dir}cdk/cdk.out"
        fi
        
        # Remove node_modules
        if [[ -d "${component_dir}cdk/node_modules" ]]; then
            echo "  Removing node_modules..."
            rm -rf "${component_dir}cdk/node_modules"
        fi
        
        # Remove dist
        if [[ -d "${component_dir}cdk/dist" ]]; then
            echo "  Removing dist..."
            rm -rf "${component_dir}cdk/dist"
        fi
    fi
done

echo ""
echo "Finished cleaning up OSML development environment!"
