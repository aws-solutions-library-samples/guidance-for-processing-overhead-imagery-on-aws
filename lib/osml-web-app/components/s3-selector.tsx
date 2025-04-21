import { useEffect } from "react";
import { Select, SelectItem } from "@heroui/react";
import { Selection } from "@react-types/shared";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { fetchBuckets, fetchBucketContents, setSelectedBucket } from "@/store/slices/s3-slice";
import { LoadingStatus } from "@/store/types";

interface S3SelectorProps {
  onBucketChange: (value: string) => void;
  onObjectChange: (value: string) => void;
  selectedBucket: string;
  selectedObject: string;
}

export function S3Selector({
                             onBucketChange,
                             onObjectChange,
                             selectedBucket,
                             selectedObject
                           }: S3SelectorProps) {
  const dispatch = useAppDispatch();
  const { buckets, bucketObjects, bucketsStatus, objectsStatus } = useAppSelector(
    (state) => state.s3
  );

  useEffect(() => {
    dispatch(fetchBuckets());
  }, [dispatch]);

  useEffect(() => {
    if (selectedBucket) {
      dispatch(fetchBucketContents(selectedBucket));
    }
  }, [selectedBucket, dispatch]);

  const handleBucketChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    console.log("Bucket change event:", e.target.value);
    const value = e.target.value;
    dispatch(setSelectedBucket(value));
    onBucketChange(value);
  };

  const handleObjectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    console.log("Object change event:", e.target.value);
    onObjectChange(e.target.value);
  };

  return (
    <div
      className="flex flex-col gap-4"
      onClick={e => e.stopPropagation()}
      onMouseDown={e => e.stopPropagation()}
    >
      <Select
        isRequired
        label="S3 Bucket"
        isLoading={bucketsStatus === LoadingStatus.Loading}
        value={selectedBucket}
        onChange={handleBucketChange}
        onClick={e => e.stopPropagation()}
        onMouseDown={e => e.stopPropagation()}
      >
        {buckets.map((bucket) => (
          <SelectItem key={bucket.name}>
            {bucket.name}
          </SelectItem>
        ))}
      </Select>

      <Select
        isRequired
        label="S3 Object"
        isLoading={objectsStatus === LoadingStatus.Loading}
        isDisabled={!selectedBucket}
        value={selectedObject}
        onChange={handleObjectChange}
        onClick={e => e.stopPropagation()}
        onMouseDown={e => e.stopPropagation()}
      >
        {bucketObjects.map((obj) => (
          <SelectItem key={obj.key}>
            {obj.key}
          </SelectItem>
        ))}
      </Select>
    </div>
  );
}
