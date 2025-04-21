import { XMarkIcon } from "@heroicons/react/16/solid";

interface FeatureClass {
  iri: string;
  score: number;
}

interface InferenceMetadata {
  jobId: string;
  inferenceDT: string;
}

interface FeatureProperties {
  geometry: any;
  imageGeometry: {
    type: string;
    coordinates: number[][][];
  };
  featureClasses: FeatureClass[];
  center_longitude: number;
  center_latitude: number;
  inferenceMetadata: InferenceMetadata;
}

interface FeaturePopupProps {
  feature: {
    getProperties: () => FeatureProperties;
  };
  position: number[];
  onClose: () => void;
}

export const FeaturePopup = ({ feature, onClose, position }: FeaturePopupProps) => {
  const properties = feature.getProperties();
  // console.log('Popup Feature:', {
  //   properties: properties,
  //   keys: Object.keys(feature.getProperties())
  // });

  // Format coordinates to 6 decimal places
  const coordinates = `${properties.center_latitude.toFixed(6)}, ${properties.center_longitude.toFixed(6)}`;

  // Format detections with confidence as percentages
  const detections = properties.featureClasses.map(fc => ({
    name: fc.iri,
    confidence: (fc.score * 100).toFixed(1)
  }));
  return (
    <div className="bg-white dark:bg-gray-800 shadow-lg rounded-lg p-4 min-w-[200px] relative">
      <button
        onClick={onClose}
        className="absolute top-2 right-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
      >
        <XMarkIcon className="w-4 h-4" />
      </button>

      <div className="space-y-2">
        <div className="text-sm">
          <span className="font-medium">Location:</span>
          <div className="ml-2">
            {coordinates}
          </div>
        </div>

        <div className="text-sm">
          <span className="font-medium">Detections:</span>
          <div className="ml-2">
            {detections.map((detection, index) => (
              <div key={index}>
                {`${detection.name}: ${detection.confidence}%`}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
