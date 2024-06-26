[//]: # (# guidance-for-overhead-imagery-inference-on-aws)
### Table of Contents

* [Installation](#installation)
* [Linting/Formatting](#lintingformatting)
* [Deployment](#deployment)
  * [Deploying Local osml-cdk-constructs](#deploying-local-osml-cdk-constructs)
* [Usage](#model-runner-usage)
  * [OSML Model Runner](#osml-model-runner)
  * [OSML Model Runner Test](#osml-model-runner-test)
  * [OSML Cesium Globe](#osml-cesium-globe)
  * [OSML Models](#osml-models)
  * [OSML Tile Server](#osml-tile-server)
* [Useful Commands](#useful-commands)
* [Troubleshooting](#troubleshooting)
  * [MemorySize value failed to satisfy constraint](#memorysize-value-failed-to-satisfy-constraint)
  * [Permission Denied for submodules](#permission-denied-for-submodules)
  * [Exit code: 137; Deployment failed: Error: Failed to build asset](#exit-code-137-deployment-failed-error-failed-to-build-asset)
  * [error TS2307: Cannot find module ‘osml-cdk-constructs](#error-ts2307-cannot-find-module-osml-cdk-constructs)
* [Support & Feedback](#support--feedback)
  * [Supporting OSML Repositories](#supporting-osml-repositories)
* [Security](#security)
* [License](#license)

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
git clone https://github.com/aws-solutions-library-samples/guidance-for-overhead-imagery-inference-on-aws.git
cd guidance-for-overhead-imagery-inference-on-aws
git-lfs pull
```

### Ubuntu (EC2)

A bootstrap script is available in `./scripts/ec2_bootstrap.sh` to automatically install all necessary dependencies for a Ubuntu EC2 instance to deploy the OSML demo.

This requires EC2 instance with internet connectivity. Insert into EC2 User Data during instance configuration or run as root once EC2 instance is running. 

Known good configuration for EC2 instance:

* 22.04 Ubuntu LTS (ami-08116b9957a259459)
* Instance Type: t3.medium 
* 50 GiB gp2 root volume

## Linting/Formatting

This package uses a number of tools to enforce formatting, linting, and general best practices:

* [black](https://github.com/psf/black) for formatting python files with community standards
* [isort](https://github.com/PyCQA/isort) for formatting with a max line length of 100
* [mypy](https://github.com/pre-commit/mirrors-mypy) to enforce static type checking
* [flake8](https://github.com/PyCQA/flake8) to check pep8 compliance and logical errors in code
* [autopep](https://github.com/pre-commit/mirrors-autopep8) to check pep8 compliance and logical errors in code
* [eslint](https://github.com/pre-commit/mirrors-eslint) to check pep8 compliance and logical errors in code
* [prettier](https://github.com/pre-commit/mirrors-prettier) to check pep8 compliance and logical errors in code
* [pre-commit](https://github.com/pre-commit/pre-commit-hooks) to install and control linters in githooks

## Deployment

1. Create an AWS account
2. Create `target_account.json` under `guidance-for-overhead-imagery-inference-on-aws/lib/accounts/`
3. Copy the below template into `target_account.json` and update your account number, alias, and region:

   ```text
   {
       "id": <target account id for deployment>,
       "name": <unique name for stacks>,
       "region": <target region for deployment>,
       "prodLike": <false || true marks resource retention>
       "deployModelRunner": <false || true deploy model runner>,
       "deployTileServer": <false || true deploy tile server>
   }
   ```

4. Export your dev account number and deployment username:

   ```
   export ACCOUNT_NUMBER=<target account number>
   export AWS_DEFAULT_REGION=<target region for deployment>
   export NAME=<unique name for stacks>
   ```

5. Optional, export the following enviornment variable if you wish to build your containers from source using the submodules.

   ```
   export BUILD_FROM_SOURCE=true
   ```

6. Pull your latest credentials into `~/.aws/credentials`

7. Go into `guidance-for-overhead-imagery-inference-on-aws` directory and execute the following commands to install npm packages:

   ```
   npm i
   ```

8. If this is your first time deploying stacks to your account, please see below (Step 9). If not, skip this step:

   ```
   npm install -g aws-cdk
   cdk synth
   cdk bootstrap
   ```

9. Make sure Docker is running on your machine:

   ```
   dockerd
   ```

10. Then deploy the stacks to your commercial account:

    ```
    npm run deploy
    ```

11. If you want to validate the deployment with integration tests:

    ```
    npm run setup
    npm run integ
    ```

12. When you are done, you can clean up the deployment:

    ```
    npm run destroy
    ```

### Deploying Local osml-cdk-constructs

By default, this package uses the osml-cdk-constructs defined in
the [official NPM repository](https://www.npmjs.com/package/osml-cdk-constructs?activeTab=readme).
If you wish to make changes to the `lib/osml-cdk-constructs`
submodule in this project and want to use those changes when
deploying, then follow these steps to switch out the remote NPM
package for the local package.

1. Pull down the submodules for development
    ```bash
    git submodule update --recursive --remote
    git-lfs clone --recurse-submodules
    ```

   If you want to pull subsequent changes to submodule packages, run:

    ```bash
    git submodule update --init --recursive
    ```

2. In `package.json`, locate `osml-cdk-constructs` under `devDependencies`. By default, it points to the latest NPM package version, but swaps out the version number with `"file:lib/osml-cdk-constructs"`. This will tell package.json to use the local package instead. The dependency will now look like this:

    ```bash
    "osml-cdk-constructs": "file:lib/osml-cdk-constructs",
    ```

3. Execute ```npm i``` to make sure everything is installed and building correctly.

4. You can now follow the [normal deployment](#deployment) steps to deploy your local changes in `osml-cdk-constructs`.


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

Here is some useful information about each of the OSML components:

### OSML Model Runner

This package contains an application used to orchestrate the execution of ML models on large satellite images. The
application monitors an input queue for processing requests, decomposes the image into a set of smaller regions and
tiles, invokes an ML model endpoint with each tile, and finally aggregates all the results into a single output. The
application itself has been containerized and is designed to run on a distributed cluster of machines collaborating
across instances to process images as quickly as possible.

For more info see [osml-model-runner](https://github.com/aws-solutions-library-samples/osml-model-runner)

### OSML Model Runner Test

This package contains the integration tests for OSML application

For more info see [osml-model-runner-test](https://github.com/aws-solutions-library-samples/osml-model-runner-test)

### OSML Cesium Globe

Build a way to visualize and display results from our image processing workflow.

For more info see [osml-cesium-globe](https://github.com/aws-solutions-library-samples/osml-cesium-globe)

### OSML Models

This package contains sample models that can be used to test OversightML installations without incurring high compute
costs typically associated with complex Computer Vision models. These models implement an interface compatible with
SageMaker and are suitable for deployment as endpoints with CPU instances.

For more info see [osml-models](https://github.com/aws-solutions-library-samples/osml-models)

### OSML Tile Server

The OversightML Tile Server is a lightweight, cloud-based tile server which allows you to quickly pass an image from S3
bucket to get metadata, image statistics, and set of tiles in real-time.

For more info on usage see [osml-tile-server](https://github.com/aws-solutions-library-samples/osml-tile-server)

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
2. Select `AWS Services` on left sidebar
3. Find and select `AWS Lambda`
   - Select `Concurrent executions`
   - Click `Request increase at account-level` on top right corner
   - Find `Increase quota value` section and increase it to `1000`
   - Then submit it.
4. This process may require up to 24 hours to complete.

To access further details regarding this matter, please visit: [AWS Lambda Memory Quotas](https://docs.aws.amazon.com/lambda/latest/dg/troubleshooting-deployment.html#troubleshooting-deployment-quotas) and [AWS Service Quotas](https://docs.aws.amazon.com/servicequotas/latest/userguide/request-quota-increase.html).

#### Permission Denied for submodules

If you are facing a permission denied issue where you are trying to `git submodule update --init --recursive`, ensure that you have [ssh-key](https://docs.github.com/authentication/connecting-to-github-with-ssh) setup.

#### Exit code: 137; Deployment failed: Error: Failed to build asset

If you are facing this error while trying to execute `npm run deploy`,
it indicates that Docker is running out of memory and requires additional ram to support it.
You can increase memory by completing the following steps:

1. Open Docker UI
2. Click `Settings` gear icon on top-right
3. Click `Resources` on the left sidebar menu
4. Click `Advanced` on the left sidebar menu
5. Find `Memory` and adjust it to 12 GB

#### error TS2307: Cannot find module ‘osml-cdk-constructs’

If you encounter an error while running `npm i` that leads to an error:

> error TS2307: Cannot find module ‘osml-cdk-constructs’ or its corresponding type declarations.

Please execute the following command and try again:

> npm install osml-cdk-constructs

## Support & Feedback

To post feedback, submit feature ideas, or report bugs, please use the [Issues](https://github.com/aws-solutions-library-samples/guidance-for-overhead-imagery-inference-on-aws/issues) section of this GitHub repo.

If you are interested in contributing to OversightML Model Runner, see the [CONTRIBUTING](CONTRIBUTING.md) guide.

### Supporting OSML Repositories

* [osml-cdk-constructs](https://github.com/aws-solutions-library-samples/osml-cdk-constructs)
* [osml-cesium-globe](https://github.com/aws-solutions-library-samples/osml-cesium-globe)
* [osml-imagery-toolkit](https://github.com/aws-solutions-library-samples/osml-imagery-toolkit)
* [osml-model-runner](https://github.com/aws-solutions-library-samples/osml-model-runner)
* [osml-model-runner-test](https://github.com/aws-solutions-library-samples/osml-model-runner-test)
* [osml-models](https://github.com/aws-solutions-library-samples/osml-models)
* [osml-tile-server](https://github.com/aws-solutions-library-samples/osml-tile-server)

## Security

See [CONTRIBUTING](CONTRIBUTING.md#security-issue-notifications) for more information.

## License

MIT No Attribution Licensed. See [LICENSE](LICENSE).
