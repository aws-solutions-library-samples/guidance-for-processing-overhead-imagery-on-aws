# Guidance for Processing Overhead Imagery on AWS

This Guidance demonstrates how to process remote sensing imagery using machine learning models that automatically detect and identify objects collected from satellites, unmanned aerial vehicles, and other remote sensing devices. Satellite images are often significantly larger than standard media files. This Guidance deploys highly scalable and available image processing services that support images of this size. These services collect, process, and analyze the images efficiently, giving you more time to assess and respond to what you discovered in your imagery.

### Table of Contents

- [Installation](#installation)
   * [MacOS](#macos)
   * [Ubuntu (EC2)](#ubuntu-ec2)
- [Deployment](#deployment)
   * [Enabling Authentication](#enabling-authentication)
   * [Deploying local osml-cdk-constructs](#deploying-local-osml-cdk-constructs)
- [Model Runner Usage](#model-runner-usage)
- [Supporting OSML Repositories](#supporting-osml-repositories)
- [Useful Commands](#useful-commands)
- [Troubleshooting](#troubleshooting)
    + [MemorySize value failed to satisfy constraint](#memorysize-value-failed-to-satisfy-constraint)
    + [Permission Denied for submodules](#permission-denied-for-submodules)
    + [Exit code: 137; Deployment failed: Error: Failed to build asset](#exit-code-137-deployment-failed-error-failed-to-build-asset)
    + [error TS2307: Cannot find module ‘osml-cdk-constructs’](#error-ts2307-cannot-find-module-osml-cdk-constructs)
- [Support & Feedback](#support--feedback)
- [Security](#security)
- [License](#license)

## Installation

### MacOS

If on a Mac without NPM/Node.js version 16 installed, run:

```bash
brew install npm
brew install node@16
```

Alternatively, NPM/Node.js can be installed through the NVM:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.5/install.sh | bash
source ~/.bash_profile
nvm install 16
```

If on a Mac without git-lfs installed, run:

```bash
brew install git-lfs
```

Otherwise, consult the official git-lfs [installation documentation](https://github.com/git-lfs/git-lfs?utm_source=gitlfs_site&utm_medium=installation_link&utm_campaign=gitlfs#installing).

Clone the repository and pull lfs files for deployment:

```bash
git clone https://github.com/aws-solutions-library-samples/guidance-for-processing-overhead-imagery-on-aws.git
cd guidance-for-processing-overhead-imagery-on-aws
git-lfs pull
```

### Ubuntu (EC2)

A bootstrap script is available in `./scripts/ec2_bootstrap_ubuntu.sh` to automatically install all necessary
dependencies for an Ubuntu EC2 instance to deploy the OSML demo.

This requires EC2 instance with internet connectivity. Insert into EC2 User Data during instance configuration
or run as root once EC2 instance is running.

Known good configuration for EC2 instance:

* 22.04 Ubuntu LTS (ami-08116b9957a259459)
* Instance Type: t3.medium
* 50 GiB gp2 root volume

## Deployment

1. Create an AWS account.

1. Pull your latest credentials into `~/.aws/credentials` and run `aws configure` - follow the prompts to set your default region.

1. Update the deployment configuration you want per the [deployment guidance](documentation/deployment/README.md).

1. Optional: If you want to enable Authentication, please head over to [Enabling Authentication](#enabling-authentication) in this README.

1. Go into `guidance-for-processing-overhead-imagery-on-aws` directory and execute the following commands to install npm packages:

   ```
   npm i
   ```

1. If this is your first time deploying stacks to your account, please see below (Step 9). If not, skip this step:

   ```
   npm install -g aws-cdk
   cdk synth
   cdk bootstrap
   ```

1. Make sure Docker is running on your machine:

   ```
   dockerd
   ```

1. Then deploy the stacks to your commercial account:

    ```
    npm run deploy
    ```

1. If you want to validate the deployment with integration tests:

    ```
    npm run setup
    npm run integ
    ```

1. When you are done, you can clean up the deployment:

    ```
    npm run destroy
    ```

### Deploying local osml-cdk-constructs

By default, this package uses the osml-cdk-constructs defined in the [official NPM repository](https://www.npmjs.com/package/osml-cdk-constructs?activeTab=readme). If you wish to make changes to the `lib/osml-cdk-constructs` submodule in this project and want to use those changes when deploying, then follow these steps to switch out the remote NPM package for the local package.

1. Pull down the submodules for development
    ```bash
    git submodule update --recursive --remote
    git-lfs clone --recurse-submodules
    ```

   If you want to pull subsequent changes to submodule packages, run:

    ```bash
    git submodule update --init --recursive
    ```

1. In `package.json`, locate `osml-cdk-constructs` under `devDependencies`. By default, it points to the latest NPM package version, but swaps out the version number with `"file:lib/osml-cdk-constructs"`. This will tell package.json to use the local package instead. The dependency will now look like this:

    ```bash
    "osml-cdk-constructs": "file:lib/osml-cdk-constructs",
    ```

1. Then cd into `lib/osml-cdk-construct` directory by executing: ```cd lib/osml-cdk-constructs```
1. Execute ```npm i; npm run build``` to make sure everything is installed and building correctly.
1. You can now follow the [normal deployment](#deployment) steps to deploy your local changes in `osml-cdk-constructs`.


## Model Runner Usage

To start a job, place an `ImageRequest` on the `ImageRequestQueue` by going into your AWS Console > Simple Queue System > `ImageRequestQueue` > Send and receive messages > and enter the provided sample for an `ImageRequest`:

**Sample ImageRequest:**

```json
{
   "jobId": "<job_id>",
   "jobName": "<job_name>",
   "jobArn": "arn:aws:oversightml:<YOUR REGION>:<YOUR ACCOUNT #>:ipj/<job_name>",
   "imageUrls": ["<image_url>"],
   "outputs": [
      {"type": "S3", "bucket": "<result_bucket_name>", "prefix": "<job_name>/"},
      {"type": "Kinesis", "stream": "<result_stream_name>", "batchSize": 1000}
   ],
   "imageProcessor": {"name": "<sagemaker_endpoint_name>", "type": "SM_ENDPOINT"},
   "imageProcessorTileSize": 512,
   "imageProcessorTileOverlap": 32,
   "imageProcessorTileFormat": "< NITF | JPEG | PNG | GTIFF >",
   "imageProcessorTileCompression": "< NONE | JPEG | J2K | LZW >"
}
```

Below are additional details about each key-value pair in the image request:

| key                           | value                                                                                                                                                                | type                 | details                                                                                                                                                                                                                                                                                      |
|-------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------|----------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| jobId                         | `<job_id>`                                                                                                                                                           | string               | Unique id for a job, ex: `testId1`                                                                                                                                                                                                                                                           |
| jobName                       | `<job_name>`                                                                                                                                                         | string               | Name of the job, ex: `jobtest-testId1`                                                                                                                                                                                                                                                       |
| jobArn                        | `arn:aws:oversightml:<YOUR REGION>:<YOUR ACCOUNT #>:ipj/<job_name>`                                                                                                  | string               | Arn which is responsible for communicating with OSML service. Insert your region, account #, and job_name. ex: `arn:aws:oversightml:us-west-2:0123456789:ipj/jobtest-testid1`                                                                                                                |
| imageUrls                     | `["<image_url>"]`                                                                                                                                                    | list[string]         | List of S3 image path, which can be found by going to your S3 bucket, ex: `s3://test-images-0123456789/tile.tif`                                                                                                                                                                             |
| outputs                       | ```{"type": "S3", "bucket": "<result_bucket_name>", "prefix": "<job_name>/"},```</br> ```{"type": "Kinesis", "stream": "<result_stream_name>", "batchSize": 1000}``` | dict[string, string] | Once the OSML has processed an image request, it will output its GeoJson files into two services, Kinesis and S3. The Kinesis and S3 are defined in `osml-cdk-constructs` package which can be found there. ex: `"bucket":"test-results-0123456789"` and `"stream":"test-stream-0123456789"` |
| imageProcessor                | ```{"name": "<sagemaker_endpoint_name>", "type": "SM_ENDPOINT"}```                                                                                                   | dict[string, string] | Select a model that you want to run your image request against, you can find the list of models by going to AWS Console > SageMaker Console > Click `Inference` (left sidebar) > Click `Endpoints` > Copy the name of any model. ex: `aircraft`                                              |
| imageProcessorTileSize        | 512                                                                                                                                                                  | integer              | Tile size represents width x height pixels and split the images into it. ex: `512`                                                                                                                                                                                                           |
| imageProcessorTileOverlap     | 32                                                                                                                                                                   | integer              | Tile overlap represents the width x height pixels and how much to overlap the existing tile, ex: `32`                                                                                                                                                                                        |
| imageProcessorTileFormat      | `NTIF / JPEF / PNG / GTIFF`                                                                                                                                          | string               | Tile format to use for tiling. I comes with 4 formats, ex: `GTIFF`                                                                                                                                                                                                                           |
| imageProcessorTileCompression | `NONE / JPEG / J2K / LZW`                                                                                                                                            | string               | The compression used for the target image. It comes with 4 formats, ex: `NONE`                                                                                                                                                                                                               |

Here is an example of a complete image request:

**Example ImageRequest:**

```json
{
   "jobId": "testid1",
   "jobName": "jobtest-testid1",
   "jobArn": "arn:aws:oversightml:us-west-2:0123456789:ipj/test-testid1",
   "imageUrls": [ "s3://test-images-0123456789/tile.tif" ],
   "outputs": [
      { "type": "S3", "bucket": "test-results-0123456789", "prefix": "jobtest-testid1/" },
      { "type": "Kinesis", "stream": "test-stream-0123456789", "batchSize": 1000 }
   ],
   "imageProcessor": { "name": "aircraft", "type": "SM_ENDPOINT" },
   "imageProcessorTileSize": 512,
   "imageProcessorTileOverlap": 32,
   "imageProcessorTileFormat": "GTIFF",
   "imageProcessorTileCompression": "NONE"
}
```

## Supporting OSML Repositories

Here is some useful information about each of the OSML components:

* [osml-cdk-constructs](https://github.com/aws-solutions-library-samples/osml-cdk-constructs)
* [osml-cesium-globe](https://github.com/aws-solutions-library-samples/osml-cesium-globe)
* [osml-imagery-toolkit](https://github.com/aws-solutions-library-samples/osml-imagery-toolkit)
* [osml-model-runner](https://github.com/aws-solutions-library-samples/osml-model-runner)
* [osml-model-runner-test](https://github.com/aws-solutions-library-samples/osml-model-runner-test)
* [osml-models](https://github.com/aws-solutions-library-samples/osml-models)
* [osml-tile-server](https://github.com/aws-solutions-library-samples/osml-tile-server)
* [osml-tile-server-test](https://github.com/aws-solutions-library-samples/osml-tile-server-test)
* [osml-data-intake](https://github.com/aws-solutions-library-samples/osml-data-intake)

## Useful Commands

* `npm run build` compile typescript to js
* `npm run watch` watch for changes and compile
* `npm run deploy` deploy all stacks to your account
* `npm run integ` run integration tests against deployment
* `npm run clean` clean up build files and node modules
* `npm run synth` synthesizes CloudFormation templates for deployments

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

#### Permission Denied for submodules

If you are facing a permission denied issue where you are trying to `git submodule update --init --recursive`, ensure that you have [ssh-key](https://docs.github.com/authentication/connecting-to-github-with-ssh) setup.

#### Exit code: 137; Deployment failed: Error: Failed to build asset

If you are facing this error while trying to execute `npm run deploy`,
it indicates that Docker is running out of memory and requires additional ram to support it.
You can increase memory by completing the following steps:

1. Open Docker UI
1. Click `Settings` gear icon on top-right
1. Click `Resources` on the left sidebar menu
1. Click `Advanced` on the left sidebar menu
1. Find `Memory` and adjust it to 12 GB

#### error TS2307: Cannot find module ‘osml-cdk-constructs’

If you encounter an error while running `npm i` that leads to an error:

> error TS2307: Cannot find module ‘osml-cdk-constructs’ or its corresponding type declarations.

Please execute the following command and try again:

> npm install osml-cdk-constructs

#### OSML-DCDataplane Stack Creation Failure

If you encounter the following error during the deployment of the OSML-DCDataplane stack:

```
OSML-DCDataplane failed: Error: The stack named OSML-DCDataplane failed creation, it may need to be manually deleted
from the AWS console: ROLLBACK_COMPLETE: Resource handler returned message: "Invalid request provided: Before you can
proceed, you must enable a service-linked role to give Amazon OpenSearch Service permissions to access your VPC.
(Service: OpenSearch, Status Code: 400, Request ID: 11ab9b5f-b59b-418a-9f89-98b1700bd248)"
```

This error indicates that the deployment could not proceed because the required service-linked role for Amazon
OpenSearch Service to access your VPC is not enabled. This is actually an issue with dependency on the custom
cloud formation resources used to provision the role; see [link](https://github.com/aws/aws-cdk/issues/27203)

**Resolution:**

1. **Re-run the Deployment:**
    - Simply re-running your deployment should resolve the issue as the service-linked role will be automatically enabled during the subsequent deployment attempt.

## Support & Feedback

To post feedback, submit feature ideas, or report bugs, please use the [Issues](https://github.com/aws-solutions-library-samples/guidance-for-processing-overhead-imagery-on-aws/issues) section of this GitHub repo.

If you are interested in contributing to OversightML Model Runner, see the [CONTRIBUTING](CONTRIBUTING.md) guide.

## Security

See [CONTRIBUTING](CONTRIBUTING.md#security-issue-notifications) for more information.

## License

MIT No Attribution Licensed. See [LICENSE](LICENSE).
