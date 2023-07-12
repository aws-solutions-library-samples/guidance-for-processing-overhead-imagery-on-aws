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
echo "  ___         _                     ___                  ___              ";
echo " / __|  ___  | |_   _  _   _ __    |   \   ___  __ __   | __|  _ _   __ __";
echo " \__ \ / -_) |  _| | || | | '_ \   | |) | / -_) \ V /   | _|  | ' \  \ V /";
echo " |___/ \___|  \__|  \_,_| | .__/   |___/  \___|  \_/    |___| |_||_|  \_/ ";
echo "                          |_|                                             ";

# call into root directory of this pacakge so that we can
# run this script from anywhere.
LOCAL_DIR="$( dirname -- "$0"; )"
cd "${LOCAL_DIR}/.." || exit 1

echo "Installing nodejs..."
NODE_VERSION=16
NODE_URL=https://rpm.nodesource.com/setup_"${NODE_VERSION}".x
wget -sL "${NODE_URL}" \
    && ./setup_"${NODE_VERSION}".x \
    && yum install -y nodejs \
    && rm ${NODE_VERSION}.x

echo "Installing integration test requirements..."
python3 -m pip install lib/osml-model-runner-test/

echo "Installing cesium globe package..."
npm install --prefix lib/osml-cesium-globe/ lib/osml-cesium-globe/

echo "Finished setting up OSML development environment!"
