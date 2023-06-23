# guidance-for-overhead-imagery-inference-on-aws

## Setting up workspace

If on a MAC without NPM/NodeJS version 16 installed run:

```bash
brew install npm
brew install node@16
```

Alternatively, NPM/NodeJS can be installed the NVM

```bash
curl -sL https://raw.githubusercontent.com/nvm-sh/nvm/v0.35.0/install.sh -o install_nvm.sh | bash
source ~/.bash_profile
nvm install 16
```

If on a MAC without git-lfs installed run:

```bash
brew install git-lfs
```

Otherwise, consult the official git-lfs [installation documentation](https://github.com/git-lfs/git-lfs?utm_source=gitlfs_site&utm_medium=installation_link&utm_campaign=gitlfs#installing)

Build a workspace:

```bash
brazil ws create --name AWSOversightMLMono
cd AWSOversightMLMono
brazil ws use \
  --versionset AWSOversightML/development \
  --platform AL2_x86_64 \
  --package AWSOversightMLMono
cd src/AWSOversightMLMono
git-lfs pull
```

## Linting/Formatting

This package uses a number of tools to enforce formatting, linting, and general best practices:

- [black](https://github.com/psf/black)
- [isort](https://github.com/PyCQA/isort) for formatting with a max line length of 100
- [mypy](https://github.com/pre-commit/mirrors-mypy) to enforce static type checking
- [flake8](https://github.com/PyCQA/flake8) to check pep8 compliance and logical errors in code
- [autopep](https://github.com/pre-commit/mirrors-autopep8) to check pep8 compliance and logical errors in code
- [eslint](https://github.com/pre-commit/mirrors-eslint) to check pep8 compliance and logical errors in code
- [prettier](https://github.com/pre-commit/mirrors-prettier) to check pep8 compliance and logical errors in code
- [pre-commit](https://github.com/pre-commit/pre-commit-hooks) to install and control linters in githooks

```bash
cd src/AWSOversightMLMono
pip install pre-commit
pip install
```

### Personal Account Setup

1. Create an AWS account
2. Create `target_account.json` under `AWSOversightMLMono/lib/accounts/`
3. Copy the below template into `target_account.json` and update your account number, alias, and region
   ```text
   {
       "id": "INSERT YOUR ACCOUNT ID",
       "name": "INSERT YOUR ALIAS",
       "region": "INSERT YOUR REGION",
       "prodLike": false,
       "smInstanceType": "ml.m4.xlarge"
   }
   ```
4. Export your dev account number, you should probably add these to your .zshrc/.bashrc
   ```
   export ACCOUNT_NUMBER=<your account number>
   ```
5. Pull your latest credentials into ~/.aws/creds

6. Go into `AWSOversightMLMono/src/AWSOversightMLMono` directory and execute the following commands to install npm packages
   ```
   npm i
   ```
7. Verify that you have the similar output:
   ```
   Successfully synthesized to /local/home/{alias}/AWSOversightMLMono/src/AWSOversightMLMono/cdk.out
   Supply a stack id ({alias}-DDB, {alias}-IAM, {alias}-Kinesis, {alias}-SNS, {alias}-VPC, {alias}-S3, {alias}-SM,
   {alias}-SQS, {alias}-ECS, {alias}-Monitoring) to display its template.
   ```
8. If this is your first time deploying stacks to your account, please see below (Step 9). If not, skip this step.

   ```
   npm install -g aws-cdk
   cdk bootstrap
   ```

9. Make sure Docker is running on your machine.

   ```
   dockerd
   ```

10. Then deploy the stacks to your commercial account
    ```
    npm run deploy
    ```

## Feature Flags:

By default, ModelRunner does not send status messages to SNS. To get status messages about the image processing status,
set the `IMAGE_PROCESSING_STATUS` environment variable to the ARN of the SNS topic to send messages to.

## Useful commands

- `npm run build && npm run deploy && npm run integ` compile, deploy, and test
- `npm run build` compile typescript to js
- `npm run watch` watch for changes and compile
- `npm run test` perform the jest unit tests
- `npm run deploy` deploy all stacks to your account
- `npm run clean` clean up build files and node modules
- `npm run lint:fix` scan and report if there's any styling issues
- `cdk deploy` deploy this stack to your default AWS account/region
- `cdk deploy ${USER}-${x} --require-approval never --exclusively` deploy a specific stack
- `cdk diff` compare deployed stack with current state
- `cdk synth` emits the synthesized CloudFormation template
