#!/bin/bash
#
# Copyright 2024 Amazon.com, Inc. or its affiliates.
#

#############################################
# EC2 Bootstrap Script for OSML Demo
#
# Installs all necessary dependencies on a fresh EC2 instance to deploy the OSML demo.
# Known good configuration:
#     - OS: Amazon Linux 2023 AMI 2023.5.20240708.0 x86_64 HVM kernel-6.1 (AMI ID: ami-078701cc0905d44e4)
#     - Instance Type: t3.medium
#     - Root Volume: 50 GiB gp2
#
# Usage:
# Insert this script into EC2 User Data or run as root on an EC2 instance with internet connectivity.
#############################################

# ASCII Art Header
cat << "EOF"
 _______  _______  __   __  ___
|       ||       ||  |_|  ||   |
|   _   ||  _____||       ||   |
|  | |  || |_____ |       ||   |
|  |_|  ||_____  ||       ||   |___
|       | _____| || ||_|| ||       |
|_______||_______||_|   |_||_______|
 _______  _______  _______  _______  _______  ______    _______  _______
|  _    ||       ||       ||       ||       ||    _ |  |   _   ||       |
| |_|   ||   _   ||   _   ||  _____||_     _||   | ||  |  |_|  ||    _  |
|       ||  | |  ||  | |  || |_____   |   |  |   |_||_ |       ||   |_| |
|  _   | |  |_|  ||  |_|  ||_____  |  |   |  |    __  ||       ||    ___|
| |_|   ||       ||       | _____| |  |   |  |   |  | ||   _   ||   |
|_______||_______||_______||_______|  |___|  |___|  |_||__| |__||___|
EOF

# Check for root privileges
if [ "$(id -u)" != "0" ]; then
   echo "This script must be run as root" >&2
   exit 1
fi

## Variable definition
LOG_FILE="/var/log/user-data.log"

## Enable logging for startup script
exec > >(tee -a $LOG_FILE)
exec 2>&1

## Install the AWS CLI
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install

## Install dependencies (root level)
yum install -y git-lfs python3-pip aws-cli npm docker

## Start and enable Docker service
systemctl start docker
systemctl enable docker

## Install CDK
npm install aws-cdk

# Clone primary AWS repo
OSML_REPO=guidance-for-processing-overhead-imagery-on-aws
git clone \
    https://github.com/aws-solutions-library-samples/$OSML_REPO.git \
    && cd $OSML_REPO \
    && git-lfs pull

# Update permissions on the repo
chmod -R 777 $OSML_REPO

# Clone submodules from HTTPS instead of SSH (since git ssh keys are not available yet)
cd $OSML_REPO \
    && git submodule update --init --recursive

echo "--------------------- EC2 Bootstrap complete ---------------------"
