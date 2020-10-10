export { FeatureLoader } from './files/feature-loader';
export { FEATURES } from './files/feature-extractor';
export { extractAlignments, AlignmentAlgorithm, Alignments } from './analysis/alignments';
export { FeatureOptions } from './files/options';
export { recGetFilesInFolder, loadJsonFile, saveJsonFile } from './files/file-manager';
export { mapSeries } from './files/util';
export { pcSetToLabel } from './files/theory';
export { saveMultinomialSequences } from './files/sequences';
export { getStandardChordSequence } from './files/leadsheets';
export { getTimelineModeLabels, getTimelineSectionModeLabels,
  getPartitionFromMSAResult } from './analysis/timeline-analysis';
export { SegmentNode } from './analysis/types';
export { hmmAlign, MSAOptions, MSA_LENGTH } from './models/models';