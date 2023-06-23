#!/bin/sh
#
# Copyright 2023 Amazon.com, Inc. or its affiliates.
#

# usage: ./scripts/katana_push.sh (execute on the root level of MonoRepo)
echo "   ___                    _       _     _            __  ";
echo "  /_____   _____ _ __ ___(_) __ _| |__ | |_  /\/\   / /  ";
echo " //  /\ \ / / _ | '__/ __| |/ _\` | '_ \| __|/    \ / /   ";
echo "/ \_// \ V |  __| |  \__ | | (_| | | | | |_/ /\/\ / /___ ";
echo "\___/   \_/ \___|_|  |___|_|\__, |_| |_|\__\/    \\____/ ";
echo "                            |___/                        ";

echo "  ___               _        _             _  __         _                        ";
echo " | _ \  _  _   ___ | |_     | |_   ___    | |/ /  __ _  | |_   __ _   _ _    __ _ ";
echo " |  _/ | || | (_-< | ' \    |  _| / _ \   | ' <  / _\` | |  _| / _\` | | ' \  / _\` |";
echo " |_|    \_,_| /__/ |_||_|    \__| \___/   |_|\_\ \__,_|  \__| \__,_| |_||_| \__,_|";
echo "                                                                                  ";



AWS_ACCOUNT=642300443113
OSML_DIRECTORY="$PWD"
OSML_TMP_STAGING=/tmp/OversightMLStaging/
OSML_REMOTE_URL="https://git-codecommit.us-west-2.amazonaws.com/v1/repos/OversightMLStaging"

echo "Fetching ${AWS_ACCOUNT} credentials"
ada cred update --account ${AWS_ACCOUNT} --role Admin --once

echo "Setting Git credentials"
git config --system --unset credential.helper # To overcome 403 Forbidden issue
git config --global credential.helper '!aws codecommit credential-helper $@'
git config --global credential.UseHttpPath true

# make sure there's no existing OversightMLStaging folder in /tmp/
rm -rf ${OSML_TMP_STAGING}

# clone the project in /tmp/ folder
git clone ${OSML_REMOTE_URL} ${OSML_TMP_STAGING}

# remove all except Katana IntegTest
echo "Deleting everything inside OversightMLStaging folder"
mv ${OSML_TMP_STAGING}/OversightML/integtest ${OSML_TMP_STAGING}/
rm -rf ${OSML_TMP_STAGING}/OversightML/

echo "Cleaning up node_modules folders in order to reduce copying to /tmp/ folder"
npm run dev:clean
cd "${OSML_DIRECTORY}" || exit 1

# lets pull in the Images.zip (CodeCommit does not support git-lfs) -- we will need to
# use S3 for this zip file.
#    CodeCommit: Maximum of 6 MB for any individual file
echo "Uploading images.zip & model_weights.pth to s3://oversightml-artifacts-${AWS_ACCOUNT}"
git-lfs pull
aws s3 cp "${OSML_DIRECTORY}"/lib/control_model/assets/model_weights.pth s3://oversightml-artifacts-${AWS_ACCOUNT}
aws s3 cp "${OSML_DIRECTORY}"/assets/images.zip s3://oversightml-artifacts-${AWS_ACCOUNT}

# copy all files from MonoRepo to OversightMLStaging folder
cp -R . ${OSML_TMP_STAGING}/OversightML/

# copy Katana Integration test back into OversightMLStaging folder
mv ${OSML_TMP_STAGING}/integtest ${OSML_TMP_STAGING}/OversightML/integtest

cd ${OSML_TMP_STAGING} || exit 1

# lets remove .git and katana_push.sh script
rm ${OSML_TMP_STAGING}/OversightML/scripts/katana_push.sh
rm ${OSML_TMP_STAGING}/OversightML/lib/cdk/accounts/target_account.json
rm -rf ${OSML_TMP_STAGING}/OversightML/.git

# Validate if its the same remote we would want to push
GIT_REMOTE=$(git config --get remote.origin.url)
if [ "$OSML_REMOTE_URL" = "$GIT_REMOTE" ]
then
    echo "REMOTE-URL MATCHED!"
    git add -A
    git commit -m "OSML Release to Katana"
    git push origin
else
    echo "Something went wrong. Remote URL does not matched! Exiting..."
    exit 1
fi

echo "Pushed to CodeCommit!"
echo "Visit https://isengard.amazon.com/federate?account=${AWS_ACCOUNT}&role=ReadOnly"

echo "Cleaning up /tmp/ folder"
rm -rf ${OSML_TMP_STAGING}

cd "${OSML_DIRECTORY}" || exit 1

echo "COMPLETED!"
exit 0
