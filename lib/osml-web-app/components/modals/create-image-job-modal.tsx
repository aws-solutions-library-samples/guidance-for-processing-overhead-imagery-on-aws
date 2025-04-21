"use client";

import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Input,
  Select,
  SelectItem,
  Accordion,
  AccordionItem, Slider
} from "@heroui/react";
import { useState } from "react";
import { v4 as uuidv4 } from 'uuid';
import { S3Selector } from "../s3-selector";
import { CreateJobRequest, FeatureDistillation, NMSAlgorithm, SoftNMSAlgorithm } from "@/services/model-runner-service";
import { viewpointService } from "@/services/viewpoint-service.ts";
import { CreateViewpointForm, viewpointToSnakeCase } from "@/store/types.ts";
import { useAppDispatch } from "@/store/hooks.ts";
import { DEFAULT_RESULT_STYLE, setLayerStyle } from "@/store/slices/map-viewer-slice.ts";

interface CreateJobModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmitAction: (data: CreateJobRequest) => void;
}

export const CreateJobModal = ({
                                 isOpen,
                                 onOpenChange,
                                 onSubmitAction,
                               }: CreateJobModalProps) => {
  const dispatch = useAppDispatch();
  const outputBucket = "mr-bucket-sink-008372964747";
  const outputStream = "mr-stream-sink-008372964747";
  const [selectedBucket, setSelectedBucket] = useState("");
  const [selectedObject, setSelectedObject] = useState("");
  const [selectedStyle, setSelectedStyle] = useState(DEFAULT_RESULT_STYLE);

  const [formData, setFormData] = useState<CreateJobRequest>({
    jobName: "",
    jobId: "",
    imageUrls: [""],
    outputs: [
      {
        type: "S3",
        bucket: outputBucket,
        prefix: "",
      },
      {
        type: "Kinesis",
        stream: outputStream,
        batchSize: 1000,
      }
    ],
    imageProcessor: {
      name: "aircraft",
      type: "SM_ENDPOINT"
    },
    imageProcessorTileSize: 256,
    imageProcessorTileOverlap: 128,
    imageProcessorTileFormat: "GTIFF",
    imageProcessorTileCompression: "NONE",
    postProcessing: [{
      step: "FEATURE_DISTILLATION",
      algorithm: {
        algorithm_type: "NMS",
        iouThreshold: 0.75
      }
    }],
    regionOfInterest: undefined,
    rangeAdjustment: "DRA"
  });

  const handleS3Selection = (bucket: string, object: string) => {
    setSelectedBucket(bucket);
    setSelectedObject(object);

    // Construct S3 URI
    const s3Uri = `s3://${bucket}/${object}`;

    // Update form data with S3 URI and output location
    setFormData({
      ...formData,
      imageUrls: [s3Uri],
      outputs: [
        {
          type: "S3",
          bucket: outputBucket,
          prefix: `${formData.jobName}/`,
        },
        formData.outputs[1]
      ]
    });
  };

  const handleSubmit = async () => {
    const jobId = uuidv4();
    const submissionData = {
      ...formData,
      jobId
    };

    // Create the viewpoint data
    const viewpointData: CreateViewpointForm = {
      viewpointName: submissionData.jobName,
      viewpointId: jobId,
      bucketName: selectedBucket,
      objectKey: selectedObject,
      tileSize: submissionData.imageProcessorTileSize,
      rangeAdjustment: formData.rangeAdjustment
    };

    try {
      dispatch(setLayerStyle({
        jobId,
        style: selectedStyle
      }));
      // Create both job and viewpoint
      await Promise.all([
        onSubmitAction(submissionData),
        viewpointService.createViewpoint(viewpointToSnakeCase(viewpointData))
      ]);

      onOpenChange(false);

      // Reset form data
      setFormData({
        ...formData,
        jobName: "",
        imageUrls: [""],
        outputs: [
          {
            type: "S3",
            bucket: outputBucket,
            prefix: "",
          },
          {
            type: "Kinesis",
            stream: outputStream,
            batchSize: 1000,
          }
        ]
      });
      setSelectedBucket("");
      setSelectedObject("");
      setSelectedStyle(DEFAULT_RESULT_STYLE);
    } catch (error) {
      console.error('Error creating job and viewpoint:', error);
      // Handle error (maybe show a notification)
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      size="2xl"
      onOpenChange={onOpenChange}
      isDismissable={false}
      hideCloseButton
    >
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader>Create Image Processing Job</ModalHeader>
            <ModalBody>
              <Accordion>
                <AccordionItem key="basic" title="Basic Information">
                  <div className="space-y-4">
                    <Input
                      isRequired
                      label="Job Name"
                      value={formData.jobName}
                      onValueChange={(value) =>
                        setFormData({
                          ...formData,
                          jobName: value,
                          outputs: [
                            {
                              ...formData.outputs[0],
                              prefix: `${value}/`
                            },
                            formData.outputs[1]
                          ]
                        })
                      }
                    />

                    <div className="space-y-2">
                      <label className="text-sm font-medium">Input Image Location</label>
                      <S3Selector
                        selectedBucket={selectedBucket}
                        selectedObject={selectedObject}
                        onBucketChange={(value: string) => handleS3Selection(value, "")}
                        onObjectChange={(value: string) => handleS3Selection(selectedBucket, value)}
                      />
                      {formData.imageUrls[0] && (
                        <div className="text-sm text-gray-600">
                          S3 URI: {formData.imageUrls[0]}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Output Sinks</label>
                    <Select
                      label="Output Sinks"
                      selectionMode="multiple"
                      selectedKeys={formData.outputs.map(output => output.type)}
                      onSelectionChange={(keys) => {
                        const selectedTypes = Array.from(keys) as string[];
                        const newOutputs = [];

                        if (selectedTypes.includes("S3")) {
                          newOutputs.push({
                            type: "S3",
                            bucket: outputBucket,
                            prefix: formData.jobName ? `${formData.jobName}/` : "",
                          });
                        }

                        if (selectedTypes.includes("Kinesis")) {
                          newOutputs.push({
                            type: "Kinesis",
                            stream: outputStream,
                            batchSize: 1000,
                          });
                        }

                        setFormData({
                          ...formData,
                          outputs: newOutputs
                        });
                      }}
                    >
                      <SelectItem key="S3">S3</SelectItem>
                      <SelectItem key="Kinesis">Kinesis</SelectItem>
                    </Select>
                  </div>
                </AccordionItem>

                <AccordionItem key="processor" title="Image Processor">
                  <div className="space-y-4">
                    <Input
                      isRequired
                      label="Model Name"
                      value={formData.imageProcessor.name}
                      onValueChange={(value) =>
                        setFormData({
                          ...formData,
                          imageProcessor: { ...formData.imageProcessor, name: value }
                        })
                      }
                    />

                    <Select
                      isRequired
                      label="Model Type"
                      selectedKeys={[formData.imageProcessor.type]}
                      onSelectionChange={(keys) =>
                        setFormData({
                          ...formData,
                          imageProcessor: {
                            ...formData.imageProcessor,
                            type: Array.from(keys)[0] as string
                          }
                        })
                      }
                    >
                      <SelectItem key="SM_ENDPOINT">SM_ENDPOINT</SelectItem>
                      <SelectItem key="HTTP_ENDPOINT">HTTP_ENDPOINT</SelectItem>
                    </Select>
                  </div>
                </AccordionItem>

                <AccordionItem key="tile" title="Tile Settings">
                  <div className="space-y-4">
                    <Input
                      type="number"
                      label="Tile Size"
                      value={formData.imageProcessorTileSize.toString()}
                      onValueChange={(value) =>
                        setFormData({
                          ...formData,
                          imageProcessorTileSize: parseInt(value) || 512
                        })
                      }
                    />

                    <Input
                      type="number"
                      label="Tile Overlap"
                      value={formData.imageProcessorTileOverlap.toString()}
                      onValueChange={(value) =>
                        setFormData({
                          ...formData,
                          imageProcessorTileOverlap: parseInt(value) || 32
                        })
                      }
                    />

                    <Select
                      label="Tile Format"
                      selectedKeys={[formData.imageProcessorTileFormat]}
                      onSelectionChange={(keys) =>
                        setFormData({
                          ...formData,
                          imageProcessorTileFormat: Array.from(keys)[0] as string
                        })
                      }
                    >
                      <SelectItem key="GTIFF">GTIFF</SelectItem>
                      <SelectItem key="NITF">NITF</SelectItem>
                      <SelectItem key="PNG">PNG</SelectItem>
                      <SelectItem key="JPEG">JPEG</SelectItem>
                    </Select>

                    <Select
                      label="Tile Compression"
                      selectedKeys={[formData.imageProcessorTileCompression]}
                      onSelectionChange={(keys) =>
                        setFormData({
                          ...formData,
                          imageProcessorTileCompression: Array.from(keys)[0] as string
                        })
                      }
                    >
                      <SelectItem key="NONE">None</SelectItem>
                      <SelectItem key="JPEG">JPEG</SelectItem>
                      <SelectItem key="J2K">J2K</SelectItem>
                      <SelectItem key="LZW">LZW</SelectItem>
                    </Select>
                  </div>
                </AccordionItem>

                <AccordionItem key="postProcessing" title="Post Processing">
                  <div className="space-y-4">
                    <Select
                      label="Algorithm Type"
                      selectedKeys={[formData.postProcessing[0]?.algorithm.algorithm_type || 'NONE']}
                      onSelectionChange={(keys) => {
                        const algorithmType = Array.from(keys)[0] as 'NONE' | 'NMS' | 'SOFT_NMS';
                        let newPostProcessing: FeatureDistillation[];

                        switch(algorithmType) {
                          case 'NMS':
                            newPostProcessing = [{
                              step: "FEATURE_DISTILLATION",
                              algorithm: {
                                algorithm_type: "NMS",
                                iouThreshold: 0.75
                              }
                            }];
                            break;
                          case 'SOFT_NMS':
                            newPostProcessing = [{
                              step: "FEATURE_DISTILLATION",
                              algorithm: {
                                algorithm_type: "SOFT_NMS",
                                iouThreshold: 0.75,
                                skipBoxThreshold: 0.0001,
                                sigma: 0.1
                              }
                            }];
                            break;
                          default: // NONE
                            newPostProcessing = [];
                            break;
                        }
                        setFormData({
                          ...formData,
                          postProcessing: newPostProcessing
                        });
                      }}
                    >
                      <SelectItem key="NMS">NMS</SelectItem>
                      <SelectItem key="SOFT_NMS">Soft NMS</SelectItem>
                    </Select>

                    {formData.postProcessing[0]?.algorithm.algorithm_type === 'NMS' && (
                      <Input
                        type="number"
                        label="IOU Threshold"
                        value={(formData.postProcessing[0].algorithm as NMSAlgorithm).iouThreshold.toString()}
                        onValueChange={(value) =>
                          setFormData({
                            ...formData,
                            postProcessing: [{
                              step: "FEATURE_DISTILLATION",
                              algorithm: {
                                algorithm_type: "NMS",
                                iouThreshold: parseFloat(value) || 0.75
                              }
                            }]
                          })
                        }
                      />
                    )}

                    {formData.postProcessing[0]?.algorithm.algorithm_type === 'SOFT_NMS' && (
                      <>
                        <Input
                          type="number"
                          label="IOU Threshold"
                          value={(formData.postProcessing[0].algorithm as SoftNMSAlgorithm).iouThreshold.toString()}
                          onValueChange={(value) =>
                            setFormData({
                              ...formData,
                              postProcessing: [{
                                step: "FEATURE_DISTILLATION",
                                algorithm: {
                                  ...(formData.postProcessing[0].algorithm as SoftNMSAlgorithm),
                                  iouThreshold: parseFloat(value) || 0.75
                                }
                              }]
                            })
                          }
                        />

                        <Input
                          type="number"
                          label="Skip Box Threshold"
                          value={(formData.postProcessing[0].algorithm as SoftNMSAlgorithm).skipBoxThreshold.toString()}
                          onValueChange={(value) =>
                            setFormData({
                              ...formData,
                              postProcessing: [{
                                step: "FEATURE_DISTILLATION",
                                algorithm: {
                                  ...(formData.postProcessing[0].algorithm as SoftNMSAlgorithm),
                                  skipBoxThreshold: parseFloat(value) || 0.0001
                                }
                              }]
                            })
                          }
                        />

                        <Input
                          type="number"
                          label="Sigma"
                          value={(formData.postProcessing[0].algorithm as SoftNMSAlgorithm).sigma.toString()}
                          onValueChange={(value) =>
                            setFormData({
                              ...formData,
                              postProcessing: [{
                                step: "FEATURE_DISTILLATION",
                                algorithm: {
                                  ...(formData.postProcessing[0].algorithm as SoftNMSAlgorithm),
                                  sigma: parseFloat(value) || 0.1
                                }
                              }]
                            })
                          }
                        />
                      </>
                    )}
                  </div>
                </AccordionItem>
                <AccordionItem key="display" title="Display Results">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Image Settings</label>
                      <Select
                        label="Image Range Adjustment"
                        selectedKeys={[formData.rangeAdjustment]}
                        onSelectionChange={(keys) => {
                          const selected = Array.from(keys)[0] as "NONE" | "MINMAX" | "DRA";
                          setFormData({
                            ...formData,
                            rangeAdjustment: selected
                          });
                        }}
                      >
                        <SelectItem key="NONE">None</SelectItem>
                        <SelectItem key="MINMAX">MinMax</SelectItem>
                        <SelectItem key="DRA">Dynamic</SelectItem>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Detection Style</label>
                      <Input
                        type="color"
                        label="Color"
                        value={selectedStyle.color}
                        onChange={(e) => setSelectedStyle({
                          ...selectedStyle,
                          color: e.target.value
                        })}
                      />

                      <Slider
                        label="Opacity"
                        step={0.01}
                        maxValue={1}
                        minValue={0}
                        value={selectedStyle.opacity}
                        onChange={(value: number | number[] ) => setSelectedStyle({
                          ...selectedStyle,
                          opacity: Array.isArray(value) ? value[0] : value
                        })}
                        className="max-w-md"
                      />
                    </div>
                  </div>
                </AccordionItem>

              </Accordion>
            </ModalBody>
            <ModalFooter>
              <Button variant="light" onPress={onClose}>
                Cancel
              </Button>
              <Button
                color="primary"
                isDisabled={!formData.jobName || !formData.imageUrls[0] || !formData.imageProcessor.name}
                onPress={handleSubmit}
              >
                Create
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
};
