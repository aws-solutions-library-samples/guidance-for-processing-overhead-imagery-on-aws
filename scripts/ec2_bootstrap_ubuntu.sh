#!/bin/bash
#
# Copyright 2024 Amazon.com, Inc. or its affiliates.
#

#############################################
# EC2 Bootstrap Script for OSML Demo
#
# Installs all necessary dependencies on a fresh EC2 instance to deploy the OSML demo.
# Known good configuration:
#     - OS: Ubuntu 22.04 LTS (AMI ID: ami-08116b9957a259459)
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
 __   __  _______  __   __  __    _  _______  __   __
|  | |  ||  _    ||  | |  ||  |  | ||       ||  | |  |
|  | |  || |_|   ||  | |  ||   |_| ||_     _||  | |  |
|  |_|  ||       ||  |_|  ||       |  |   |  |  |_|  |
|       ||  _   | |       ||  _    |  |   |  |       |
|       || |_|   ||       || | |   |  |   |  |       |
|_______||_______||_______||_|  |__|  |___|  |_______|
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

# Define constants
LOG_FILE="/var/log/user-data.log"
USERNAME="ubuntu"

# Redirect stdout and stderr to log file
exec > >(tee -a $LOG_FILE) 2>&1

# Update system
apt-get update -y

# Install necessary packages
apt-get install -y git-lfs python3-pip ca-certificates curl unzip nodejs

# Setup Node.js repository and install Node.js
curl -fsSL https://deb.nodesource.com/setup_16.x | bash -
apt-get install -y nodejs

# Install AWS CLI
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip -o awscliv2.zip
./aws/install

# Install AWS CDK
npm install -g aws-cdk

# Setup Docker repository and install Docker components
apt-get install -y uidmap docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  tee /etc/apt/sources.list.d/docker.list > /dev/null

# Add ubuntu user to the docker group
usermod -aG docker $USERNAME

# Reset the instance
newgrp docker

# Setup rootless Docker for the user
su - "$USERNAME" -c "dockerd-rootless-setuptool.sh install"

# Install Python packages
su - "$USERNAME" -c "pip3 install geojson pytest boto3"

# Clone primary AWS repo and configure git
su - "$USERNAME" -c "git clone https://github.com/aws-solutions-library-samples/guidance-for-overhead-imagery-inference-on-aws.git && cd guidance-for-overhead-imagery-inference-on-aws && git-lfs pull && sed -i 's/git@github.com:/https:\/\/github.com\//g' .gitmodules && git submodule update --init --recursive"

echo "--------------------- EC2 Bootstrap complete ---------------------"
