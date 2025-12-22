# Guidance for Processing Overhead Imagery on AWS

This Guidance demonstrates how to process remote sensing imagery using machine learning models that automatically detect and identify objects collected from satellites, unmanned aerial vehicles, and other remote sensing devices. Satellite images are often significantly larger than standard media files. This Guidance deploys highly scalable and available image processing services that support images of this size. These services collect, process, and analyze the images efficiently, giving you more time to assess and respond to what you discovered in your imagery.

### Table of Contents

- [Architecture Overview](#architecture-overview)
- [Installation](#installation)
   * [MacOS](#macos)
   * [EC2 Instance](#ec2-instance)
- [Configuration](#configuration)
- [Deployment](#deployment)
- [Supporting OSML Repositories](#supporting-osml-repositories)
- [Useful Commands](#useful-commands)
- [Troubleshooting](#troubleshooting)
    + [MemorySize value failed to satisfy constraint](#memorysize-value-failed-to-satisfy-constraint)
    + [Exit code: 137; Deployment failed: Error: Failed to build asset](#exit-code-137-deployment-failed-error-failed-to-build-asset)
    + [OSML-DataIntake-Dataplane Stack Creation Failure](#osml-dataintake-dataplane-stack-creation-failure)
- [Support & Feedback](#support--feedback)
- [Security](#security)
- [License](#license)

## Architecture Overview

This guidance package orchestrates the deployment of several independent OSML components, each responsible for a distinct part of the imagery processing pipeline. The components are designed to be modular — you can deploy them together for a turnkey experience or integrate individual components into your existing infrastructure.

### Core Services

- **[osml-model-runner](https://github.com/awslabs/osml-model-runner)** — The central image processing engine. It monitors an SQS queue for image processing requests, decomposes large images into tiles, invokes ML models hosted on SageMaker endpoints, and aggregates the results into geolocated feature collections. Runs as a scalable ECS Fargate service.

- **[osml-models](https://github.com/awslabs/osml-models)** — Production ML models (currently SAM3 from Meta AI) packaged for deployment as SageMaker real-time endpoints. Provides text-prompted object detection and segmentation on geospatial imagery. Deploying this component requires downloading the SAM3 model checkpoint (~3GB) from [Hugging Face](https://huggingface.co/facebook/sam3) ahead of time (a Hugging Face account with model access is required). Place the downloaded `sam3.pt` file in a local directory and set `sam3PtLocalPath` in your deployment configuration. See the [osml-models README](https://github.com/awslabs/osml-models#quick-start) for detailed instructions.

- **[osml-tile-server](https://github.com/awslabs/osml-tile-server)** — A dynamic tile serving service that renders map tiles from large imagery on demand. Runs as an ECS Fargate service behind an internal Application Load Balancer.

- **[osml-data-intake](https://github.com/awslabs/osml-data-intake)** — Handles ingestion of imagery metadata into a STAC (SpatioTemporal Asset Catalog) backed by OpenSearch. Provides a STAC-compliant API for querying and discovering imagery assets.

- **[osml-geo-agents](https://github.com/awslabs/osml-geo-agents)** — Geospatial AI agent tools exposed through a Model Context Protocol (MCP) server. Provides operations like feature clustering, dataset correlation, geometry transformations, and more for use by AI agents.

### Foundation and Integration

- **osml-vpc** — A sample VPC configuration included in this repository (`lib/osml-vpc`) that provides the shared networking infrastructure (VPC, subnets, NAT gateways) used by all components. This is provided for convenience — in production deployments, you will likely bring your own VPC by specifying `networkConfig.VPC_ID` in each component's configuration.

- **[osml-apis](lib/osml-apis)** — An API Gateway layer included in this repository (`lib/osml-apis`) that provides one approach to exposing the internal service endpoints (Tile Server, Data Intake, Geo Agents) externally with JWT-based authentication. This is one example of how these services can be integrated — the underlying components expose their own ALBs and Lambda functions that can be wired into your existing API infrastructure however you see fit.

- **[amazon-mission-solutions-auth-server](https://github.com/awslabs/amazon-mission-solutions-auth-server)** — A Keycloak-based OIDC authentication server. This is provided for deployments where an existing OIDC identity provider is not available. If you already have an OIDC solution (e.g., Cognito, Okta, Auth0), you can skip this component and configure `osml-apis` to validate tokens against your existing provider.

### How They Fit Together

```
Wave 1 (Foundation)           Wave 2 (Core Services)      Wave 3 (API Layer)
┌──────────┐                  ┌───────────────────┐
│ osml-vpc │─────────────────▶│ osml-model-runner │
└──────────┘        │         ├───────────────────┤
                    ├────────▶│ osml-models       │
┌──────────────┐    │         ├───────────────────┤         ┌───────────┐
│ auth-server  │────┤────────▶│ osml-tile-server  │────────▶│ osml-apis │
│ (optional)   │    │         ├───────────────────┤         │ (optional)│
└──────────────┘    ├────────▶│ osml-data-intake  │────────▶│           │
                    │         ├───────────────────┤         │           │
                    └────────▶│ osml-geo-agents   │────────▶│           │
                              └───────────────────┘         └───────────┘
```

The deploy script handles this orchestration automatically using dependency-based topological sort, including passing outputs (VPC IDs, ALB URLs, Lambda ARNs) between dependent components.

## Installation

### MacOS

If on a Mac without NPM/Node.js version 24 installed, run:

```bash
brew install npm
brew install node@24
```

Alternatively, NPM/Node.js can be installed through the NVM:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
source ~/.bash_profile
nvm install 24
```

If on a Mac without git-lfs installed, run:

```bash
brew install git-lfs
```

Otherwise, consult the official git-lfs [installation documentation](https://github.com/git-lfs/git-lfs?utm_source=gitlfs_site&utm_medium=installation_link&utm_campaign=gitlfs#installing).

Clone the repository:

```bash
git clone https://github.com/aws-solutions-library-samples/guidance-for-processing-overhead-imagery-on-aws.git
cd guidance-for-processing-overhead-imagery-on-aws
```

### EC2 Instance

A bootstrap script is available at `./scripts/ec2_bootstrap.sh` that automatically installs all necessary dependencies and clones the OSML repository. The script supports multiple operating systems:

- Amazon Linux 2 / 2023
- Ubuntu 22.04+

Insert into EC2 User Data during instance configuration or run as root once the EC2 instance is running. The script requires internet connectivity.

Known good configurations:

* Amazon Linux 2023 AMI, t3.medium, 50 GiB gp2 root volume
* Ubuntu 22.04 LTS AMI, t3.medium, 50 GiB gp2 root volume

The bootstrap script will:
1. Install system packages (git, git-lfs, Docker, AWS CLI)
2. Install Node.js 24 via nvm
3. Clone the OSML repository to your home directory
4. Install npm dependencies

After the script completes, log out and back in to activate Docker group membership, then configure your deployment as described in the [Configuration](#configuration) section.

## Configuration

Before deploying, you need to create a configuration file that specifies your AWS account details and component settings.

### Creating the Configuration File

Copy the example configuration file to create your deployment configuration:

```bash
cp bin/deployment.json.example bin/deployment.json
```

### Configuration Structure

The `bin/deployment.json` file has the following structure:

```json
{
  "account": {
    "id": "123456789012",
    "region": "us-west-2",
    "prodLike": false,
    "isAdc": false
  },
  "osml-vpc": { ... },
  "amazon-mission-solutions-auth-server": { ... },
  "osml-model-runner": { ... },
  "osml-models": { ... },
  "osml-tile-server": { ... },
  "osml-data-intake": { ... },
  "osml-geo-agents": { ... },
  "osml-apis": { ... }
}
```

### Required Fields

| Field | Description | Example |
|-------|-------------|---------|
| `account.id` | Your 12-digit AWS account ID | `"123456789012"` |
| `account.region` | AWS region for deployment | `"us-west-2"` |

### Optional Account Fields

| Field | Description | Default |
|-------|-------------|---------|
| `account.prodLike` | Enable production-like settings (stricter security, higher availability) | `false` |
| `account.isAdc` | Set to `true` if deploying to an Amazon Dedicated Cloud region | `false` |

### Component Configuration

Each OSML component supports the following fields:

| Field | Description | Required |
|-------|-------------|----------|
| `deploy` | Set to `true` to deploy this component, `false` to skip | Yes |
| `retry` | Number of retry attempts if deployment fails (useful for transient errors like race conditions). Default: `0` | No |
| `dependsOn` | Array of component names that must be deployed first | No |
| `gitUrl` | Git repository URL for the component source code | No |
| `gitTarget` | Git branch, tag, or commit to checkout | No |
| `config` | Component-specific configuration options | Yes |
| `gitProtocol` | Git clone protocol: `"https"` (default) or `"ssh"` | No |
| `sam3PtLocalPath` | Local path to SAM3 checkpoint file (osml-models only) | No |

### Component-Specific Config Options

Each component's `config` section supports:

| Field | Description |
|-------|-------------|
| `projectName` | CloudFormation stack name prefix |
| `networkConfig` | VPC and networking overrides |
| `dataplaneConfig.BUILD_FROM_SOURCE` | Set to `true` to build Docker images locally |
| `deployIntegrationTests` | Set to `true` to deploy integration test infrastructure |
| `dataplaneConfig.authConfig` | Authentication configuration (for osml-apis) |
| `dataplaneConfig.DOMAIN_HOSTED_ZONE_ID` | Route53 hosted zone ID for custom domains |
| `dataplaneConfig.DOMAIN_HOSTED_ZONE_NAME` | Domain name for custom domains |

### Example: Minimal Configuration

For a basic deployment with default settings:

```json
{
  "account": {
    "id": "YOUR_ACCOUNT_ID",
    "region": "us-west-2"
  }
}
```

The deploy script will use default values for any unspecified components.

### Example: Selective Component Deployment

To deploy only the Model Runner component:

```json
{
  "account": {
    "id": "YOUR_ACCOUNT_ID",
    "region": "us-west-2"
  },
  "osml-vpc": {
    "deploy": true
  },
  "osml-model-runner": {
    "deploy": true,
    "dependsOn": ["osml-vpc"],
    "gitUrl": "https://github.com/awslabs/osml-model-runner",
    "gitTarget": "main",
    "config": {
      "projectName": "OSML-ModelRunner",
      "dataplaneConfig": {
        "BUILD_FROM_SOURCE": true
      }
    }
  }
}
```

Components not listed or with `"deploy": false` will be skipped.

## Deployment

1. Create an AWS account.

1. Pull your latest credentials into `~/.aws/credentials` and run `aws configure` - follow the prompts to set your default region.

1. Configure your deployment by copying the example configuration file:

   ```bash
   cp bin/deployment.json.example bin/deployment.json
   ```

   Edit `bin/deployment.json` and update the required fields:
   - `account.id`: Your 12-digit AWS account ID
   - `account.region`: The AWS region for deployment (e.g., `us-west-2`)

   See the [Configuration](#configuration) section for more details on available options.

1. Go into `guidance-for-processing-overhead-imagery-on-aws` directory and execute the following commands to install npm packages:

   ```
   npm i
   ```

1. Make sure Docker is running on your machine:

   ```
   dockerd
   ```

1. Then deploy the stacks to your commercial account:

    ```
    npm run deploy
    ```

    By default, `npm run deploy` uses whatever code exists in the `lib/` directories. If you want to force a fresh clone of all component repositories from their configured `gitUrl` and `gitTarget`, use:

    ```
    npm run deploy -- --git-clone-force
    ```

    The deploy script automatically handles CDK bootstrapping on first deployment.

1. If you want to validate the deployment with integration tests, run the component-specific test commands:

    ```bash
    npm run integ:model-runner   # Run Model Runner integration tests
    npm run integ:tile-server    # Run Tile Server integration tests
    npm run integ:data-intake    # Run Data Intake integration tests
    npm run integ:geo-agents     # Run Geo Agents integration tests
    ```

1. When you are done, you can clean up the deployment:

    ```
    npm run destroy
    ```

## Supporting OSML Repositories

Here is some useful information about each of the active OSML component repositories:

* [osml-model-runner](https://github.com/awslabs/osml-model-runner) - Core image processing and ML inference service
* [osml-models](https://github.com/awslabs/osml-models) - Production ML models (SAM3) for SageMaker deployment
* [osml-tile-server](https://github.com/awslabs/osml-tile-server) - Dynamic tile serving for large imagery
* [osml-data-intake](https://github.com/awslabs/osml-data-intake) - Data ingestion and STAC catalog management
* [osml-geo-agents](https://github.com/awslabs/osml-geo-agents) - Geospatial AI agent tools via MCP server
* [amazon-mission-solutions-auth-server](https://github.com/awslabs/amazon-mission-solutions-auth-server) - Keycloak-based authentication server
* [osml-imagery-toolkit](https://github.com/awslabs/osml-imagery-toolkit) - Library of common imagery processing utilities

## Useful Commands

### Build Commands

* `npm run build` compile typescript to js
* `npm run watch` watch for changes and compile
* `npm run clean` clean up build files and node modules

### Deployment Commands

* `npm run deploy` deploy all stacks to your account (uses existing lib/ contents)
* `npm run deploy -- --git-clone-force` force fresh clone of all component repositories before deploying
* `npm run destroy` tear down all deployed stacks

### Integration Test Commands

* `npm run integ:model-runner` run Model Runner integration tests
* `npm run integ:tile-server` run Tile Server integration tests
* `npm run integ:data-intake` run Data Intake integration tests
* `npm run integ:geo-agents` run Geo Agents integration tests

> **Note:** By default, `npm run deploy` uses whatever code exists in the `lib/` directories. If your local code diverges from the configured `gitTarget` in `bin/deployment.json`, a warning will be displayed but deployment will proceed. Use `--git-clone-force` to reset to the configured state.

## Troubleshooting

This is a list of common problems / errors to help with troubleshooting:

#### MemorySize value failed to satisfy constraint

If you encounter an issue where the deployment is reporting this error:

```
"'MemorySize' value failed to satisfy constraint: Member must have value less than or equal to 3008
```

The restriction stems from the limitations of your AWS account. To address this issue, you'll need to access your AWS Account
1. Go to Service Quotas
1. Select `AWS Services` on left sidebar
1. Find and select `AWS Lambda`
   - Select `Concurrent executions`
   - Click `Request increase at account-level` on top right corner
   - Find `Increase quota value` section and increase it to `1000`
   - Then submit it.
1. This process may require up to 24 hours to complete.

To access further details regarding this matter, please visit: [AWS Lambda Memory Quotas](https://docs.aws.amazon.com/lambda/latest/dg/troubleshooting-deployment.html#troubleshooting-deployment-quotas) and [AWS Service Quotas](https://docs.aws.amazon.com/servicequotas/latest/userguide/request-quota-increase.html).

#### Exit code: 137; Deployment failed: Error: Failed to build asset

If you are facing this error while trying to execute `npm run deploy`,
it indicates that Docker is running out of memory and requires additional ram to support it.
You can increase memory by completing the following steps:

1. Open Docker UI
1. Click `Settings` gear icon on top-right
1. Click `Resources` on the left sidebar menu
1. Click `Advanced` on the left sidebar menu
1. Find `Memory` and adjust it to 12 GB

#### OSML-DataIntake-Dataplane Stack Creation Failure

If you encounter the following error during the deployment of the OSML-DCDataplane stack:

```
OSML-DataIntake-Dataplane failed: Error: The stack named OSML-DataIntake-Dataplane failed creation, it may need to be manually deleted
from the AWS console: ROLLBACK_COMPLETE: Resource handler returned message: "Invalid request provided: Before you can
proceed, you must enable a service-linked role to give Amazon OpenSearch Service permissions to access your VPC.
(Service: OpenSearch, Status Code: 400, Request ID: 11ab9b5f-b59b-418a-9f89-98b1700bd248)"
```

This error indicates that the deployment could not proceed because the required service-linked role for Amazon
OpenSearch Service to access your VPC is not enabled. This is actually an issue with dependency on the custom
cloud formation resources used to provision the role; see [link](https://github.com/aws/aws-cdk/issues/27203)

**Resolution:** The example configuration sets `"retry": 1` for the `osml-data-intake` component, which causes the deploy script to automatically retry the deployment after a 30-second delay. This is typically sufficient to resolve the issue since the service-linked role will be available on the second attempt. If you removed the `retry` setting or encounter this with a fresh configuration, simply re-running `npm run deploy` will also resolve it.

## Support & Feedback

To post feedback, submit feature ideas, or report bugs, please use the [Issues](https://github.com/aws-solutions-library-samples/guidance-for-processing-overhead-imagery-on-aws/issues) section of this GitHub repo.

If you are interested in contributing to OversightML Model Runner, see the [CONTRIBUTING](CONTRIBUTING.md) guide.

## Security

See [CONTRIBUTING](CONTRIBUTING.md#security-issue-notifications) for more information.

## License

MIT No Attribution Licensed. See [LICENSE](LICENSE).
