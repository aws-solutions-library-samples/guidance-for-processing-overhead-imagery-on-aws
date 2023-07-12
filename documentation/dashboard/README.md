# OSML CloudWatch Metrics

Cloudwatch Metrics Dashboards enable the user to monitor the OversightML(OSML) ModelRunner application and infrastructure. Currently, in the `AWSOversightML` dashboard, there are six widgets (see below) and each widget displays metrics gathered on the application. The dashboard can be found under AWS Console > CloudWatch > Dashboards (left side pane) > `AWSOversightML`.

### Image/Region Requests

- There are six individual metrics that represents the pending queues used to manage image requests:
  - **Pending Region Requests**
    - Number of region requests in the queue are awaiting to be processed
  - **Oldest Pending Region Request**
    - One region request that has been in pending for the longest amount of time
  - **Failed Region Requests**
    - OSML ModelRunner failed to process at least one (1) region request
  - **Pending Image Requests**
    - Number of image requests in the queue are awaiting to be processed
  - **Oldest Pending Region Request**
    - One image request that has been in pending for the longest amount of time
  - **Failed Image Requests**
    - OSML ModelRunner failed to process at least one (1) image request

### Processing Stats - TIFF

- Tagged Image File Format (TIFF):
  - **Regions Processed**
    - Number of regions processed by OSML ModelRunner
  - **Tiling Latency**
    - Amount of time it takes for OSML ModelRunner to process the tiling
  - **Regions Latency**
    - Amount of time it takes for OSML ModelRunner to process the regions
  - **Tiles Processed**
    - Number of tiles processed by OSML ModelRunner
  - **Processing Failures**
    - Number of failures that OSML ModelRunner failed to process

### Processing Stats - NITF

- National Imagery Transmission Format (NTIF):
  - **Regions Processed**
    - Number of regions processed by OSML ModelRunner
  - **Tiling Latency**
    - Amount of time it takes for OSML ModelRunner to process the tiling
  - **Regions Latency**
    - Amount of time it takes for OSML ModelRunner to process the regions
  - **Tiles Processed**
    - Number of tiles processed by OSML ModelRunner
  - **Processing Failures**
    - Number of failures that OSML ModelRunner failed to process

### Model Statistics

- Model statistics includes metrics about the models hosted on SageMaker endpoints:
  - **Avg Inference Latency**
    - Amount of time (average) it takes for OSML ModelRunner to analyze and classify the models
  - **Invocations**
    - Number of executions by OSML ModelRunner
  - **Model Errors**
    - Number of errors occurred when processing the image
  - **Throttling Errors**
    - Number of errors that is affected due to throttling limit
  - **Throttling Exceptions**
    - Number of exceptions that is affected due to throttling limit
  - **Avg Image Latency**
    - Amount of time (average) it takes for OSML ModelRunner to process the image

### Feature Metrics

- The feature metrics are meant to provide insight to computational latency around storing and writing aggregate feature collections for ModelRunner outputs.
  - **Feature Store Avg Latency**
    - Amount of time (average) it takes for OSML ModelRunner to write the output to DynamoDB (DDB), S3, and/or Kinesis
  - **Feature Aggregation Latency**
    - Amount of time it takes for OSML ModelRunner to aggregate the feature

### MR Cluster Utilization

- The cluster metrics capture the hardware metrics for the ECS task instances it hosts:
  - **CPU Utilization**
    - Amazon Elastic Container Service (Amazon ECS)‘s usage of processing the image(s)/region(s)
  - **Memory Utilization**
    - Amazon Elastic Container Service (Amazon ECS)‘s usage of processing the image(s)/region(s)
