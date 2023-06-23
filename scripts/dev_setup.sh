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

echo "Installing miniconda3..."
MINICONDA_VERSION=Miniconda3-latest-Linux-x86_64
MINICONDA_URL=https://repo.anaconda.com/miniconda/"${MINICONDA_VERSION}".sh
wget -c "${MINICONDA_URL}" \
    && chmod +x "${MINICONDA_VERSION}".sh \
    && ./"${MINICONDA_VERSION}".sh -b -f -p /usr/local \
    && rm ${MINICONDA_VERSION}.sh

echo "Installing python venv and gdal..."
conda install -q -y --prefix /usr/local python=3.10 gdal

echo "Installing model runner requirements..."
python3 -m pip install -r lib/model_runner/requirements.txt

echo "Installing control model requirements..."
python3 -m pip install -r lib/control_model/requirements.txt

echo "Installing integration test requirements..."
python3 -m pip install -r lib/integration_test/requirements.txt

# install pre-commit hooks and linting configuration
echo "Installing pre-commit..."
python3 -m pip install pre-commit
pre-commit install

echo "Finished setting up OSML development environment!"
