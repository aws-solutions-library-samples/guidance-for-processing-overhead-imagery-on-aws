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
echo "  ___                  ___                 _                                     _   ";
echo " |   \   ___  __ __   |   \   ___   _ __  | |  ___   _  _   _ __    ___   _ _   | |_ ";
echo " | |) | / -_) \ V /   | |) | / -_) | '_ \ | | / _ \ | || | | '  \  / -_) | ' \  |  _|";
echo " |___/  \___|  \_/    |___/  \___| | .__/ |_| \___/  \_, | |_|_|_| \___| |_||_|  \__|";
echo "                                   |_|               |__/                            ";



# call into root directory of this pacakge so that we can
# run this script from anywhere.
LOCAL_DIR="$( dirname -- "$0"; )"
cd "${LOCAL_DIR}/.." || exit 1

echo "Running model runner unit tests..."
npm run unit-test:model-runner || exit 1

echo "Running aircraft model unit tests..."
npm run unit-test:aircraft-model || exit 1

echo "Synthesizing cdk resources..."
npm run build:cdk || exit 1

echo "Deploying cdk stacks..."
npm run build:deploy || exit 1

echo "Running model runner integration tests..."
npm run dev:integ || exit 1

echo "Successfully built, deployed, and tested local changes!"
exit 0
