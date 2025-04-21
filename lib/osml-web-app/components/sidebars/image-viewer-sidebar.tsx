"use client";

import { useState } from "react";
import {
  Accordion,
  AccordionItem,
  Button,
  Listbox,
  ListboxItem,
  useDisclosure,
} from "@heroui/react";

import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { CreateViewpointForm, LoadingStatus } from "@/store/types";
import {
  setSelectedViewpoint,
  fetchViewpointBounds,
  fetchViewpointMetadata,
  fetchViewpointInfo,
  fetchViewpointStatistics,
  deleteViewpoint,
  createViewpoint,
} from "@/store/slices/image-viewer-slice";
import { CreateIcon, DeleteIcon } from "@/components/icons";
import { CreateViewpointModal } from "@/components/modals/create-viewpoint-modal";
import { DeleteViewpointModal } from "@/components/modals/delete-viewpoint-modal";

export const ImageViewerSidebar = () => {
  const { isOpen, onOpen, onOpenChange } = useDisclosure();
  const {
    isOpen: isDeleteModalOpen,
    onOpen: onDeleteModalOpen,
    onOpenChange: onDeleteModalOpenChange,
  } = useDisclosure();
  const [viewpointToDelete, setViewpointToDelete] = useState<string | null>(
    null,
  );
  const dispatch = useAppDispatch();
  const {
    viewpoints,
    selectedViewpoint,
    viewpointBounds,
    viewpointMetadata,
    viewpointInfo,
    viewpointStatistics,
    viewpointsStatus,
    viewpointBoundsStatus,
    viewpointMetadataStatus,
    viewpointInfoStatus,
    viewpointStatisticsStatus,
    viewpointBoundsError,
    viewpointMetadataError,
    viewpointInfoError,
    viewpointStatisticsError,
  } = useAppSelector((state) => state.imageViewer);

  const handleViewpointSelect = (viewpointId: string) => {
    const viewpoint = viewpoints.find((v) => v.viewpoint_id === viewpointId);

    if (viewpoint) {
      dispatch(
        setSelectedViewpoint({
          viewpointId: viewpoint.viewpoint_id,
          viewpointTileSize: viewpoint.tile_size,
        }),
      );
      dispatch(fetchViewpointBounds(viewpointId));
      dispatch(fetchViewpointMetadata(viewpointId));
      dispatch(fetchViewpointInfo(viewpointId));
      dispatch(fetchViewpointStatistics(viewpointId));
    }
  };

  const handleDeleteViewpoint = (viewpointId: string) => {
    setViewpointToDelete(viewpointId);
    onDeleteModalOpen();
  };

  const confirmDelete = () => {
    if (viewpointToDelete) {
      dispatch(deleteViewpoint(viewpointToDelete));

      if (selectedViewpoint?.viewpointId === viewpointToDelete) {
        dispatch(setSelectedViewpoint(null));
      }
    }
    setViewpointToDelete(null);
    onDeleteModalOpenChange();
  };

  const handleCreateViewpoint = (data: CreateViewpointForm) => {
    dispatch(createViewpoint(data));
  };

  const renderViewpointsList = () => {
    if (viewpointsStatus === LoadingStatus.Loading) {
      return <div className="p-4 text-center">Loading viewpoints...</div>;
    }

    if (viewpointsStatus === LoadingStatus.Error) {
      return (
        <div className="p-4 text-center text-danger">
          Failed to load viewpoints
        </div>
      );
    }

    if (viewpoints.length === 0) {
      return <div className="p-4 text-center">No viewpoints available</div>;
    }

    return (
      <Listbox
        aria-label="Viewpoints"
        selectedKeys={selectedViewpoint ? [selectedViewpoint.viewpointId] : []}
        selectionMode="single"
        onSelectionChange={(keys) => {
          if (keys instanceof Set && keys.size > 0) {
            const selectedKey = Array.from(keys)[0] as string;

            handleViewpointSelect(selectedKey);
          }
        }}
      >
        {viewpoints.map((viewpoint) => (
          <ListboxItem
            key={viewpoint.viewpoint_id}
            endContent={
              <Button
                isIconOnly
                className="opacity-0 group-hover:opacity-100 transition-opacity"
                color="danger"
                size="sm"
                variant="light"
                onPress={() => handleDeleteViewpoint(viewpoint.viewpoint_id)}
              >
                <DeleteIcon />
              </Button>
            }
          >
            {viewpoint.viewpoint_name}
          </ListboxItem>
        ))}
      </Listbox>
    );
  };

  const renderAccordionContent = (
    status: LoadingStatus,
    error: string | null,
    data: any,
    emptyMessage: string = "No data available",
  ) => {
    if (status === LoadingStatus.Loading) {
      return <div className="p-4 text-center">Loading...</div>;
    }
    if (status === LoadingStatus.Error) {
      return (
        <div className="p-4 text-center text-danger">
          {error || "Error loading data"}
        </div>
      );
    }
    if (!data) {
      return <div className="p-4 text-center">{emptyMessage}</div>;
    }

    return (
      <pre className="text-sm overflow-auto p-4">
        {JSON.stringify(data, null, 2)}
      </pre>
    );
  };

  return (
    <>
      <Accordion defaultExpandedKeys={["1"]} selectionMode="multiple">
        <AccordionItem
          key="1"
          aria-label="Viewpoints"
          subtitle={
            viewpointsStatus === LoadingStatus.Loading ? "Loading..." : ""
          }
          title="Viewpoints"
        >
          <div className="space-y-2">
            {renderViewpointsList()}
            <div className="px-2 pt-2 border-t">
              <Button
                isIconOnly
                aria-label="Create new viewpoint"
                className="w-full flex items-center justify-center"
                color="primary"
                variant="light"
                onPress={onOpen}
              >
                <CreateIcon /> Create Viewpoint
              </Button>
            </div>
          </div>
        </AccordionItem>

        <AccordionItem
          key="2"
          aria-label="Bounds"
          subtitle={
            viewpointBoundsStatus === LoadingStatus.Loading ? "Loading..." : ""
          }
          title="Bounds"
        >
          {renderAccordionContent(
            viewpointBoundsStatus,
            viewpointBoundsError,
            viewpointBounds,
            "Select a viewpoint to view bounds",
          )}
        </AccordionItem>

        <AccordionItem
          key="3"
          aria-label="Metadata"
          subtitle={
            viewpointMetadataStatus === LoadingStatus.Loading
              ? "Loading..."
              : ""
          }
          title="Metadata"
        >
          {renderAccordionContent(
            viewpointMetadataStatus,
            viewpointMetadataError,
            viewpointMetadata,
            "Select a viewpoint to view metadata",
          )}
        </AccordionItem>

        <AccordionItem
          key="4"
          aria-label="Info"
          subtitle={
            viewpointInfoStatus === LoadingStatus.Loading ? "Loading..." : ""
          }
          title="Info"
        >
          {renderAccordionContent(
            viewpointInfoStatus,
            viewpointInfoError,
            viewpointInfo,
            "Select a viewpoint to view info",
          )}
        </AccordionItem>

        <AccordionItem
          key="5"
          aria-label="Statistics"
          subtitle={
            viewpointStatisticsStatus === LoadingStatus.Loading
              ? "Loading..."
              : ""
          }
          title="Statistics"
        >
          {renderAccordionContent(
            viewpointStatisticsStatus,
            viewpointStatisticsError,
            viewpointStatistics,
            "Select a viewpoint to view statistics",
          )}
        </AccordionItem>
      </Accordion>
      <DeleteViewpointModal
        isOpen={isDeleteModalOpen}
        onDeleteAction={confirmDelete}
        onOpenChange={onDeleteModalOpenChange}
      />
      <CreateViewpointModal
        isOpen={isOpen}
        onOpenChange={onOpenChange}
        onSubmitAction={handleCreateViewpoint}
      />
    </>
  );
};
