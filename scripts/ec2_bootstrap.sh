#!/bin/bash

#########################
# EC2 Boostrap script for OSML Demo
#
# This script will install all necessary dependencies for a fresh EC2 instance to deploy the OSML demo.
# Requires EC2 instance with internet connectivity. Insert into EC2 User Data or run as root once 
# EC2 instance is running. This script does not execute any CDK commands to build AWS infrastructure
#
# Known good configuration: 
#     - 22.04 Ubuntu LTS (ami-08116b9957a259459)
#     - Instance Type: t3.medium 
#     - 50 GiB gp2 root volume
##########

## Variable definition
LOG_FILE="/var/log/user-data.log"
USERNAME="ubuntu"

## Enable logging for startup script
exec > >(tee -a $LOG_FILE)
exec 2>&1

## Install dependencies (root level)
# Node 16, npm git-lfs, pip3, AWS CDK
curl -fsSL https://deb.nodesource.com/setup_16.x | bash -
apt-get install -y nodejs
apt-get install -y git-lfs
apt-get install -y python3-pip
apt-get install -y awscli
npm install -g aws-cdk

# Docker
apt-get -y update
apt-get install -y ca-certificates curl
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  tee /etc/apt/sources.list.d/docker.list > /dev/null
apt-get -y update
apt-get install -y uidmap
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

## Install dependencies (user account)
# Docker rootless
su - "$USERNAME" -c "dockerd-rootless-setuptool.sh install"

# Python packages
su - "$USERNAME" -c "pip3 install geojson \
    && pip3 install pytest \
    && pip3 install boto3"

# Clone primary AWS repo
su - "$USERNAME" -c "git clone \
    https://github.com/aws-solutions-library-samples/guidance-for-overhead-imagery-inference-on-aws.git \
    && cd guidance-for-overhead-imagery-inference-on-aws \
    && git-lfs pull"

# Clone submodules from HTTPS instead of SSH (since git ssh keys are not available yet)
su - "$USERNAME" -c "cd guidance-for-overhead-imagery-inference-on-aws \
    && sed -i 's/git@github.com:/https:\/\/github.com\//g' .gitmodules \
    && git submodule update --init --recursive"

echo "--------------------- EC2 Bootstrap complete ---------------------"