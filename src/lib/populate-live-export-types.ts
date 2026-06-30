export type PopulateExportProvenance = {
  templateNodeId: string;
  templateLabel?: string;
  pageId?: string;
  slideIndex?: number;
  pickedRows?: Record<string, string>;
  pickedPoses?: Record<string, string>;
  manualValues?: Record<string, string>;
};

export type PopulateGalleryItem = {
  exportId: string;
  name: string;
  matchId: string;
  matchLabel: string;
  createdAt: string;
  viewUrl: string;
  thumbUrl?: string;
  source?: PopulateExportProvenance;
};
