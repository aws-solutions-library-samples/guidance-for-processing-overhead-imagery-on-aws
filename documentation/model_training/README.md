# SageMaker Notebook Tutorial with Detectron2 and RealPlanes

This README will give step-by-step instructions for setting up a SageMaker Notebook instance that is capable of running the provided Jupyter Notebook.

The Jupyter Notebook will demonstrate how detectron2 can be used in conjunction with the RealPlanes dataset to create a computer vision model capable of segmenting airplanes from satellite images.

## Common Terms

**detectron2**: an open-source library based on PyTorch that is developed by the Facebook team.

**RealPlanes**: a satellite dataset that segments airplanes from many high-resolution satellite images.

**SageMaker Notebooks**: standalone, fully managed Jupyter Notebook instances in the Amazon SageMaker console.

## SageMaker Notebook Setup

### Creating the Notebook

1. Navigate to the Sagemaker console: <https://${REGION}.console.aws.amazon.com/sagemaker/>
2. On the left panel, select Notebooks -> Notebook Instances
3. Click on "Create notebook instance"
4. Input a Notebook instance name. Suggested: `detectron2-realplanes-demo`
5. For notebook instance type we *must* use a GPU instance. For this demo, `ml.g5.xlarge` is sufficient
6. Under "Additional configuration", increase the volume size from the default to 500 GB
7. All the other default settings are fine for this demo, so click "Create notebook instance"

### Installing the dataset into the Notebook

1. Once the SageMaker Notebook's status is "InService", click on "Open JupyterLab"
2. JupyterLab will open and display a Launcher with several options
3. Under "Other", select "Terminal" to open a terminal session
4. Use the command `aws s3 cp s3://rareplanes-public/real/tarballs/train/RarePlanes_train_PS-RGB_tiled.tar.gz ./SageMaker/` to copy the RealPlanes training data from S3 into your Notebook instance
5. Use the command `aws s3 cp s3://rareplanes-public/real/tarballs/metadata_annotations.tar.gz ./SageMaker/` to copy the RealPlanes metadata for the training images from S3 into your Notebook instance
6. Unzip both files with the commands `tar xvzf RarePlanes_train_PS-RGB_tiled.tar.gz` and `tar xvzf metadata_annotations.tar.gz`

### Executing the Jupyter Notebook

1. Upload the provided Jupyter Notebook file to your instance. This can be accomplished my simply dragging the `.ipynb` into the file hiearchy in the SageMaker Notebook interface
2. Open the `.ipynb` file and when prompted to select a Kernel for the notebook, select `conda_pytorch_p39`
3. The notebook comes pre-populated with outputs to demonstrate what the code does
4. When you feel ready to run the Notebook yourself, click the `>>` button at the top of the tab that says "Restart Kernel and Run All Cells". The output of the final cell will be different than the one originally provided because the final cell of the notebook selects a random image to test
