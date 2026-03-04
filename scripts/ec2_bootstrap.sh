#!/bin/bash
#
# Copyright 2023-2026 Amazon.com, Inc. or its affiliates.
#

#############################################
# EC2 Bootstrap Script for OSML
#
# Installs all necessary dependencies on a fresh EC2 instance to deploy OSML.
# Supports: Amazon Linux 2/2023, Ubuntu 22.04+
#
# Known good configurations:
#     - Amazon Linux 2023 AMI, t3.medium, 50 GiB gp2
#     - Ubuntu 22.04 LTS AMI, t3.medium, 50 GiB gp2
#
# Usage:
#     Insert into EC2 User Data or run as root on an EC2 instance.
#############################################

set -e

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

# =============================================================================
# Configuration
# =============================================================================
NODE_VERSION="24"
OSML_REPO="guidance-for-processing-overhead-imagery-on-aws"
OSML_REPO_URL="https://github.com/aws-solutions-library-samples/${OSML_REPO}.git"
LOG_FILE="/var/log/osml-bootstrap.log"

# =============================================================================
# Logging
# =============================================================================
exec > >(tee -a "$LOG_FILE") 2>&1

log_info() {
    echo "[INFO] $*"
}

log_error() {
    echo "[ERROR] $*" >&2
}

# =============================================================================
# Checks
# =============================================================================
if [ "$(id -u)" != "0" ]; then
    log_error "This script must be run as root"
    exit 1
fi

# Determine the actual user (not root)
if [ -n "$SUDO_USER" ]; then
    ACTUAL_USER="$SUDO_USER"
    USER_HOME=$(getent passwd "$SUDO_USER" | cut -d: -f6)
else
    # Fallback for EC2 user data execution
    if id "ec2-user" &>/dev/null; then
        ACTUAL_USER="ec2-user"
    elif id "ubuntu" &>/dev/null; then
        ACTUAL_USER="ubuntu"
    else
        ACTUAL_USER="root"
    fi
    USER_HOME=$(getent passwd "$ACTUAL_USER" | cut -d: -f6)
fi

log_info "Installing for user: $ACTUAL_USER (home: $USER_HOME)"

# =============================================================================
# OS Detection
# =============================================================================
detect_os() {
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        OS_ID="$ID"
        OS_VERSION="$VERSION_ID"
        log_info "Detected OS: $OS_ID $OS_VERSION"
    else
        log_error "Cannot detect OS - /etc/os-release not found"
        exit 1
    fi
}

# =============================================================================
# Package Installation (OS-specific)
# =============================================================================
install_packages() {
    log_info "Installing system packages..."

    case "$OS_ID" in
        amzn|rhel|centos|fedora)
            # Amazon Linux / RHEL family
            if command -v dnf &>/dev/null; then
                dnf install -y git git-lfs python3-pip jq unzip tar
            else
                yum install -y git git-lfs python3-pip jq unzip tar
            fi
            ;;
        ubuntu|debian)
            apt update -y
            apt install -y git git-lfs python3-pip jq unzip tar curl ca-certificates
            ;;
        *)
            log_error "Unsupported OS: $OS_ID"
            exit 1
            ;;
    esac
}

# =============================================================================
# Docker Installation (OS-specific)
# =============================================================================
install_docker() {
    log_info "Installing Docker..."

    case "$OS_ID" in
        amzn|rhel|centos|fedora)
            if command -v dnf &>/dev/null; then
                dnf install -y docker
            else
                yum install -y docker
            fi
            systemctl start docker
            systemctl enable docker
            ;;
        ubuntu|debian)
            # Use official Docker repo for Ubuntu
            curl -fsSL https://get.docker.com | sh
            systemctl start docker
            systemctl enable docker
            ;;
    esac

    # Add user to docker group
    usermod -aG docker "$ACTUAL_USER"
    log_info "Added $ACTUAL_USER to docker group (re-login required)"
}

# =============================================================================
# AWS CLI Installation
# =============================================================================
install_aws_cli() {
    if command -v aws &>/dev/null; then
        log_info "AWS CLI already installed: $(aws --version)"
        return
    fi

    log_info "Installing AWS CLI v2..."
    curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "/tmp/awscliv2.zip"
    unzip -q -o /tmp/awscliv2.zip -d /tmp
    /tmp/aws/install
    rm -rf /tmp/awscliv2.zip /tmp/aws
}

# =============================================================================
# Node.js Installation (via nvm)
# =============================================================================
install_nodejs() {
    log_info "Installing nvm and Node.js ${NODE_VERSION}..."

    # Install nvm for the actual user
    sudo -u "$ACTUAL_USER" bash << EOF
        export HOME="$USER_HOME"
        curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash

        # Load nvm
        export NVM_DIR="\$HOME/.nvm"
        [ -s "\$NVM_DIR/nvm.sh" ] && . "\$NVM_DIR/nvm.sh"

        # Install and use Node.js
        nvm install ${NODE_VERSION}
        nvm use ${NODE_VERSION}
        nvm alias default ${NODE_VERSION}

        # Install global packages
        npm install -g aws-cdk
EOF

    log_info "Node.js ${NODE_VERSION} installed via nvm"
}

# =============================================================================
# Clone OSML Repository
# =============================================================================
clone_repository() {
    local repo_path="${USER_HOME}/${OSML_REPO}"

    if [ -d "$repo_path" ]; then
        log_info "Repository already exists at $repo_path"
        return
    fi

    log_info "Cloning OSML repository..."
    sudo -u "$ACTUAL_USER" git clone "$OSML_REPO_URL" "$repo_path"

    # Pull LFS files
    cd "$repo_path"
    sudo -u "$ACTUAL_USER" git lfs pull

    log_info "Repository cloned to $repo_path"
}

# =============================================================================
# Install Project Dependencies
# =============================================================================
install_dependencies() {
    local repo_path="${USER_HOME}/${OSML_REPO}"

    log_info "Installing npm dependencies..."

    sudo -u "$ACTUAL_USER" bash << EOF
        export HOME="$USER_HOME"
        export NVM_DIR="\$HOME/.nvm"
        [ -s "\$NVM_DIR/nvm.sh" ] && . "\$NVM_DIR/nvm.sh"

        cd "$repo_path"
        npm install
EOF
}

# =============================================================================
# Print Next Steps
# =============================================================================
print_next_steps() {
    local repo_path="${USER_HOME}/${OSML_REPO}"

    cat << EOF

=====================================================================
                    EC2 Bootstrap Complete!
=====================================================================

Repository location: $repo_path

Next steps:

1. Log out and back in (or run: newgrp docker)
   This activates the docker group membership.

2. Configure AWS credentials:
   aws configure

   Or attach an IAM role to this EC2 instance with appropriate permissions.

3. Edit the deployment configuration:
   cd $repo_path
   nano bin/deployment.json

   Update account.id and account.region with your values.

4. Deploy OSML:
   cd $repo_path
   ./scripts/deploy.sh

For more options, run: ./scripts/deploy.sh --help

=====================================================================
EOF
}

# =============================================================================
# Main
# =============================================================================
main() {
    log_info "Starting OSML EC2 bootstrap..."

    detect_os
    install_packages
    install_docker
    install_aws_cli
    install_nodejs
    clone_repository
    install_dependencies
    print_next_steps

    log_info "Bootstrap complete!"
}

main
