#!/bin/sh
#
# Copyright 2023 Amazon.com, Inc. or its affiliates.
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

# call into root directory of this pacakge so that we can
# run this script from anywhere.
LOCAL_DIR="$( dirname -- "$0"; )"
cd "${LOCAL_DIR}/.." || exit 1
echo "Removing dist folder..."
rm -rf dist

echo "Removing cdk.out folder..."
rm -rf cdk.out

echo "Removing cdk.context.json..."
rm -rf cdk.context.json

echo "Removing aws_lambda.bundle*..."
rm -rf aws_lambda.bundle*

echo "Removing node_modules folder..."
rm -rf node_modules

echo "Finished cleaning up OSML development environment!"
