# TEST IMAGERY
This directory includes a collection of images intended to use for testing model runner, and its various components and
are meant to be deployed by this CDK pacakge by the MRTesting Construct. All the images here were taken and/or converted
from imagery found in the [RarePlanes](https://www.cosmiqworks.org/rareplanes-public-user-guide/) dataset.

## tile.tif/ntf/jpeg/png
![Tile](tile.png)

These are a single 512x512 tiles, ranging from 100KB to 800KB in size, containing 2 aircraft roughly at their center to
use for testing that model runner can process each supported image format correctly. They can also be used to validate
that the aircraft model is producing expected results for the aircraft in the image. These tiles do not contain GIS
metadata for rectification, and thus they should return coordinate results in pixel space.

## small.tif
This is a small Geotiff image, 26.1MB and 3376×2576, taken from the RarePlanes dataset used to test basic functionality
for model runner to process an image.

## large.tif
This is a larger Geotiff image, 484.7MB and 12987×12438, taken from the RarePlanes dataset used to test basic
functionality, along with performance when handling tiling a heavier image.

## meta.ntf
This is a small NITF image, 1.1MB and 1024x1024, with classification metadata embedded in it. It is used to test model runners ability to
parse that metadata and embedded in the corresponding FeatureCollection output properties.

## sicd-capella-chip.ntf / sicd-umbra-chip.ntf
This is a small chip sicd-capella/sicd-umbra image, 1.1M/2.1M and 512x512/512x512 respectively, taken from large capella/umbra imagery. It is used to test the model runners ability to parse that metadata and embedded in the corresponding FeatureCollection output properties. These images were taken from: [capella](https://radiantearth.github.io/stac-browser/#/external/capella-open-data.s3.us-west-2.amazonaws.com/stac/capella-open-data-by-datetime/capella-open-data-2021/capella-open-data-2021-8/capella-open-data-2021-8-7/CAPELLA_C03_SP_SICD_HH_20210807095836_20210807095839/CAPELLA_C03_SP_SICD_HH_20210807095836_20210807095839.json?.language=en&.asset=asset-HH) and [umbra](https://umbra.space/open-data)

## sicd-interferometric-hh.nitf
This is a larger Nitf image, 197MB and 6679x3859, taken from this website: https://github.com/ngageoint/six-library/wiki/Sample-SICDs, this is to ensure that the OSML can handle a large SAR data.
