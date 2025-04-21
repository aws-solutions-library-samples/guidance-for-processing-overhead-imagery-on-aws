"use client";

import { useState, useEffect } from "react";
import {
  Accordion,
  AccordionItem,
  Button,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Selection,
  Slider,
  Spinner,
  useDisclosure
} from "@heroui/react";
import { CreateIcon } from "@/components/icons";
import { CreateJobModal } from "@/components/modals/create-image-job-modal";
import { modelRunnerService, ImageProcessingJob, CreateJobRequest } from "@/services/model-runner-service";
import {
  ExclamationTriangleIcon,
  ChevronUpDownIcon,
  EyeIcon, EyeSlashIcon
} from "@heroicons/react/16/solid";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { DEFAULT_RESULT_STYLE, setLayerOrder, setLayerStyle, setSelectedJobs } from "@/store/slices/map-viewer-slice";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';


const ColorControls = ({
                         jobId
                       }: {
  jobId: string;
}) => {
  const dispatch = useAppDispatch();
  const style = useAppSelector((state) =>
    state.mapViewer.map.layerStyles[jobId] || DEFAULT_RESULT_STYLE
  );

  useEffect(() => {
    document.documentElement.style.setProperty('--slider-color', style.color);
  }, [style.color]);

  return (
    <div className="p-2 w-48">
      <Input
        type="color"
        aria-label="Color"
        size="sm"
        className="mb-2"
        value={style.color}
        onChange={(e) => {
          dispatch(setLayerStyle({
            jobId,
            style: {
              ...style,
              color: e.target.value
            }
          }));
        }}
      />
      <Slider
        aria-label="Opacity"
        size="sm"
        step={0.01}
        maxValue={1}
        minValue={0}
        value={style.opacity}
        onChange={(value: number | number[]) => {
          dispatch(setLayerStyle({
            jobId,
            style: {
              ...style,
              opacity: Array.isArray(value) ? value[0] : value
            }
          }));
        }}
        classNames={{
          base: "w-full",
          track: "bg-default-100",
          filler: "opacity-slider-fill",
          thumb: [
            "transition-all",
            "bg-background",
            "border-2",
            `border-[${style.color}]`,
            "shadow-lg",
            "data-[dragging=true]:scale-110",
          ]
        }}
      />
    </div>
  );
};


const StatusArea = ({
                      status,
                      isSelected,
                      jobId
                    }: {
  status: string;
  isSelected: boolean;
  jobId: string;
}) => {
  const style = useAppSelector((state) =>
    state.mapViewer.map.layerStyles[jobId] || DEFAULT_RESULT_STYLE
  );

  if (status !== 'SUCCESS') {
    return (
      <div className="flex items-center gap-2 flex-shrink-0">
        {status === 'PARTIAL'
          ? <ExclamationTriangleIcon className="w-5 h-5 text-warning" />
          : <Spinner size="sm" variant="dots" />
        }
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 flex-shrink-0">
      <Popover placement="right">
        <PopoverTrigger>
          <div
            className="w-5 h-5 rounded cursor-pointer color-indicator"
            style={{
              border: `2px solid ${style.color}`,
            }}
          >
            <div
              className="w-full h-full rounded"
              style={{
                backgroundColor: style.color,
                opacity: style.opacity,
              }}
            />
          </div>
        </PopoverTrigger>
        <PopoverContent onClick={(e) => e.stopPropagation()}>
          <div onClick={(e) => e.stopPropagation()}>
            <ColorControls jobId={jobId} />
          </div>
        </PopoverContent>
      </Popover>
      {isSelected
        ? <EyeIcon className="w-5 h-5 text-default-400" />
        : <EyeSlashIcon className="w-5 h-5 text-default-400" />
      }
    </div>
  );
};

const SortableItem = ({ job, isSelected, disabled }: {
  job: ImageProcessingJob;
  isSelected: boolean;
  disabled: boolean;
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: job.job_id, disabled });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`
      flex group gap-2 items-center justify-between relative px-2 py-1.5 w-full h-full 
      box-border rounded-small subpixel-antialiased cursor-pointer tap-highlight-transparent 
      outline-none data-[focus-visible=true]:z-10 data-[focus-visible=true]:outline-2 
      data-[focus-visible=true]:outline-focus data-[focus-visible=true]:outline-offset-2 
      data-[focus-visible=true]:dark:ring-offset-background-content1 
      transition-colors hover:bg-default hover:text-default-foreground
      ${disabled ? 'opacity-50' : 'opacity-100'} 
      ${isSelected ? 'bg-default-100' : ''}
    `}
      role="option"
      aria-selected={isSelected}
      aria-label={job.status}
      data-hover="true"
    >
      <div {...attributes} {...listeners} className="flex items-center">
        <ChevronUpDownIcon className="w-5 h-5 text-default-400 cursor-grab active:cursor-grabbing" />
      </div>
      <div className="w-full flex flex-col items-start justify-center">
      <span
        data-label="true"
        className="flex-1 text-small font-normal"
      >
        <div className="flex items-center gap-2">
          {job.job_name || job.job_id}
        </div>
      </span>
        <span className="w-full text-tiny text-foreground-500 group-hover:text-current truncate">
        {job.status === "SUCCESS"
          ? `Duration: ${job.processing_duration}s`
          : job.image_status || 'Pending'
        }
      </span>
      </div>
      <StatusArea
        status={job.status}
        isSelected={isSelected}
        jobId={job.job_id}
      />
    </div>
  );
};


export const MapViewerSidebar = () => {
  const { isOpen, onOpen, onOpenChange } = useDisclosure();
  const dispatch = useAppDispatch();
  const [jobs, setJobs] = useState<ImageProcessingJob[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<Selection>(new Set([]));
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [customOrder, setCustomOrder] = useState<string[]>([]);

  const refreshSeconds = 10;

  const fetchJobs = async () => {
    try {
      const jobsList = await modelRunnerService.listImageProcessingJobs();
      setJobs(jobsList);
      setError(null);
    } catch (err) {
      setError("Failed to load jobs");
      console.error(err);
    } finally {
      setInitialLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs();
    const interval = setInterval(fetchJobs, refreshSeconds * 1000);
    return () => clearInterval(interval);
  }, []);

  // Update Redux store when selection changes
  useEffect(() => {
    const selectedJobIds = Array.from(selectedKeys as Set<string>);
    const selectedJobObjects = jobs.filter(job =>
      selectedJobIds.includes(job.job_id) && job.status === "SUCCESS"
    );
    dispatch(setSelectedJobs(selectedJobObjects));
  }, [selectedKeys, jobs, dispatch]);

  // Set initial job order
  useEffect(() => {
    if (jobs.length > 0 && customOrder.length === 0) {
      const initialOrder = jobs
        .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
        .map(job => job.job_id);
      setCustomOrder(initialOrder);
    }
  }, [jobs]);

  const handleCreateJob = async (data: CreateJobRequest) => {
    try {
      await modelRunnerService.createImageProcessingJob(data);
      // Update the custom order to include the new job at the top
      setCustomOrder(prevOrder => [data.jobId, ...prevOrder]);
      fetchJobs();
    } catch (err) {
      console.error("Failed to create job:", err);
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = customOrder.indexOf(active.id as string);
      const newIndex = customOrder.indexOf(over.id as string);
      const newOrder = arrayMove(customOrder, oldIndex, newIndex);
      dispatch(setLayerOrder(newOrder))
      setCustomOrder(newOrder);
    }
  };

  const handleJobSelection = (jobId: string, disabledKeys: string[]) => {
    if (!disabledKeys.includes(jobId)) {
      setSelectedKeys(prevKeys => {
        const newSelection = new Set(prevKeys instanceof Set ? prevKeys : []);
        if (newSelection.has(jobId)) {
          newSelection.delete(jobId);
        } else {
          newSelection.add(jobId);
        }
        return newSelection;
      });
    }
  };

  // Update Redux store when selection changes
  useEffect(() => {
    const selectedJobIds = Array.from(selectedKeys as Set<string>);
    const selectedJobObjects = jobs.filter(job =>
      selectedJobIds.includes(job.job_id) && job.status === "SUCCESS"
    );
    dispatch(setSelectedJobs(selectedJobObjects));
  }, [selectedKeys, jobs, dispatch]);

  const renderJobsList = () => {
    if (initialLoading && jobs.length === 0) {
      return <div className="p-4 text-center">Loading jobs...</div>;
    }
    if (error) {
      return <div className="p-4 text-center text-danger">{error}</div>;
    }
    if (jobs.length === 0) {
      return <div className="p-4 text-center">No jobs available</div>;
    }

    // Sort jobs based on custom order
    const sortedJobs = [...jobs].sort((a, b) => {
      const aIndex = customOrder.indexOf(a.job_id);
      const bIndex = customOrder.indexOf(b.job_id);

      // If both items are in the custom order, use that
      if (aIndex !== -1 && bIndex !== -1) {
        return aIndex - bIndex;
      }

      // For new items, fall back to timestamp sorting
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });

    const disabledKeys = sortedJobs
      .filter(job => job.status !== "SUCCESS")
      .map(job => job.job_id);

    return (
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={sortedJobs.map(job => job.job_id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-1">
            {sortedJobs.map((job) => (
              <div
                key={job.job_id}
                onClick={() => handleJobSelection(job.job_id, disabledKeys)}
              >
                <SortableItem
                  job={job}
                  isSelected={selectedKeys instanceof Set ? selectedKeys.has(job.job_id) : false}
                  disabled={disabledKeys.includes(job.job_id)}
                />
              </div>
            ))}
          </div>
        </SortableContext>
      </DndContext>
    );
  };


  return (
    <>
      <div className="space-y-4">
        <Accordion defaultExpandedKeys={["1"]} selectionMode="multiple">
          <AccordionItem
            key="1"
            aria-label="Image Processing Jobs"
            title="Image Processing Jobs"
          >
            <div className="space-y-2">
              {renderJobsList()}
              <div className="px-2 pt-2 border-t">
                <Button
                  isIconOnly
                  aria-label="Create new job"
                  className="w-full flex items-center justify-center"
                  color="primary"
                  variant="light"
                  onPress={onOpen}
                >
                  <CreateIcon /> Create Job
                </Button>
              </div>
            </div>
          </AccordionItem>

          <AccordionItem
            key="2"
            aria-label="Map Controls"
            title="Map Controls"
          >
            <div className="space-y-2">
              {/* Add map controls here when needed */}
            </div>
          </AccordionItem>
        </Accordion>
      </div>

      <CreateJobModal
        isOpen={isOpen}
        onOpenChange={onOpenChange}
        onSubmitAction={handleCreateJob}
      />
    </>
  );
};
