/** Golden set + benchmark contracts (Brief 0). */

export interface GoldenSetManifest {
  version: 1;
  documents: GoldenDocument[];
}

export interface GoldenDocument {
  id: string;
  file: string;
  sha256: string;
  kind: "native" | "flattened" | "mixed";
  sector?: string;
  groundTruth: GroundTruthLogo[];
}

export interface GroundTruthLogo {
  page: number;
  bboxPage: [number, number, number, number];
  role: "primary" | "secondary";
  variant?: "full" | "isotype" | "wordmark";
  notes?: string;
}

export interface BenchmarkResult {
  runId: string;
  pipelineVersion: string;
  perDocument: DocumentResult[];
  summary: {
    docsTotal: number;
    docsWithUsablePrimary: number;
    usableRate: number;
    meanBestIoU: number;
    /** Detección visión: % GT primary con IoU>0.5 vs cualquier logoInstance en su página (audit). */
    instanceRecallAt50: number;
  };
}

export type FailureClass =
  | "no_detection"
  | "page_not_sampled"
  | "wrong_object"
  | "bad_bbox"
  | "crop_unusable";

export interface DocumentResult {
  docId: string;
  /** Selección: mejor logo del harvest (pick-best). */
  predictedPage: number | null;
  predictedBboxPage: [number, number, number, number] | null;
  bestIoU: number;
  iouPass: boolean;
  cropPass: boolean;
  usable: boolean;
  failureClass?: FailureClass;
  sampledPages: number[];
  gtPrimaryPages: number[];
  /** Detección: GT primary con algún logoInstance de visión IoU>0.5 en su página. */
  detectionHits: number;
  detectionTotal: number;
  detectionRecallAt50: number;
  visionCacheSource?: string;
}
