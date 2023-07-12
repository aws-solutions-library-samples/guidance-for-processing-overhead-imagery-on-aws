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
This is a small NITF image with classification metadata embedded in it. It is used to test model runners ability to
parse that metadata and embedded in the corresponding FeatureCollection output properties.
