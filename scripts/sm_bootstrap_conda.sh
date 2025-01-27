#!/bin/bash

set -e

# Define the Conda environment and dependencies
ENV_NAME="conda_python3"
ENV_FILE_PATH="/home/ec2-user/guidance-for-processing-overhead-imagery-on-aws/conda/sm_notebook_env.yml"

# Update Conda
echo "Updating Conda..."
sudo -u ec2-user -i conda update -n base -c defaults conda -y

# Ensure the Conda environment exists
echo "Ensuring the $ENV_NAME environment is set up..."
sudo -u ec2-user -i conda activate $ENV_NAME || sudo -u ec2-user -i conda create -n $ENV_NAME python=3.10 -y

# Install dependencies into the existing Conda environment
echo "Installing dependencies from $ENV_FILE_PATH into $ENV_NAME..."
sudo -u ec2-user -i conda env update -n $ENV_NAME -f $ENV_FILE_PATH --prune

# Set up the Conda environment as a Jupyter kernel
echo "Setting up Jupyter to use the $ENV_NAME environment..."
source /home/ec2-user/anaconda3/bin/activate $ENV_NAME
sudo -u ec2-user -i conda install -n $ENV_NAME ipykernel -y
python -m ipykernel install --user --name $ENV_NAME --display-name "Python ($ENV_NAME)"

# Install Git LFS (Large File Storage)
echo "Installing Git LFS..."
sudo yum install -y amazon-linux-extras
sudo amazon-linux-extras enable epel
sudo yum install -y git-lfs
git lfs install

# Install Node.js and AWS CDK
echo "Installing Node.js and AWS CDK..."
sudo yum install -y nodejs
npm install -g aws-cdk

# Verify installations
echo "Verifying installations..."
node -v
npm -v
cdk --version
git lfs --version

echo "Provisioning completed successfully."
