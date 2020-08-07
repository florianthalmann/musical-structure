import * as _ from 'lodash';
import { QUANT_FUNCS as QF, getSimpleSmithWatermanPath, SmithWatermanOptions } from 'siafun';
import { FeatureOptions, FeatureLoader, FEATURES as FS,
  extractAlignments, AlignmentAlgorithm, Alignments } from '../../index';
import { recGetFilesInFolder, loadJsonFile, saveJsonFile } from '../../files/file-manager';
import { mapSeries } from '../../files/util';
import { pcSetToLabel } from '../../files/theory';
import { saveMultinomialSequences } from '../../files/sequences';
import { getStandardChordSequence } from '../../files/leadsheets';
import { getTimelineModeLabels, getTimelineSectionModeLabels,
  getPartitionFromMSAResult } from '../../analysis/timeline-analysis';
import { SegmentNode } from '../../analysis/types';
import { hmmAlign, MSAOptions, MSA_LENGTH } from '../../models/models';


const DATASET = '../fifteen-songs-dataset/';
const AUDIO = '/Volumes/FastSSD/gd_tuned/audio/'//DATASET+'tuned_audio/';
const FEATURES = '/Volumes/FastSSD/gd_tuned/features/'//'./features/';
const PATTERNS = './patterns2/';
const RESULTS = './results2/';


const MSA_CONFIG: MSAOptions　= {
  modelLength: MSA_LENGTH.MEDIAN,
  iterations: 1,
  edgeInertia: 0.8,
  distInertia: 0.8,
  matchMatch: 0.999,
  deleteInsert: 0.01,
  flankProb: undefined
}

const FEATURE_CONFIG: FeatureOptions = {
  selectedFeatures: [FS.MADMOM_BEATS, FS.GO_CHORDS]
}

const SW_CONFIG: SmithWatermanOptions = {
  quantizerFunctions: [QF.ORDER(), QF.IDENTITY()],
  maxIterations: 1,
  minSegmentLength: 16,
  nLongest: 10,
  maxGapSize: 4,
  //maxGapRatio: 0.25,
  minDistance: 4,
  cacheDir: PATTERNS
}

const MAX_VERSIONS = 100;
const SELF_ALIGNMENTS = false;
const PAIRWISE_ALIGNMENTS = 5;
const NUM_CONNECTIONS = 1;
const MASK_THRESHOLD = .1;

run();

async function run() {
  const songs: string[] = _.keys(loadJsonFile(DATASET+'dataset.json'));
  const results = await mapSeries(songs, async s => {
    console.log('working on '+s);
    const versions = recGetFilesInFolder(AUDIO+s+'/', ['wav']).slice(-MAX_VERSIONS);
    const points = await new FeatureLoader(FEATURES)
      .getPointsForAudioFiles(versions, FEATURE_CONFIG);
    console.log('saving feature sequences')
    const seqsFile = RESULTS+s+"-seqs.json";
    saveMultinomialSequences(points, seqsFile);
    console.log('multiple sequence alignment')
    const msaFile = await hmmAlign(seqsFile, RESULTS+s+'-', MSA_CONFIG);
    console.log('pairwise and self alignments')
    const alignments = extractAlignments({
      collectionName: s,
      patternsFolder: PATTERNS,
      algorithm: AlignmentAlgorithm.SW,
      points: points,
      audioFiles: versions,
      swOptions: SW_CONFIG,
      includeSelfAlignments: SELF_ALIGNMENTS,
      numTuplesPerFile: PAIRWISE_ALIGNMENTS,
      tupleSize: 2
    });
    return getEvaluation(s, points, msaFile, alignments);
  });
  
  saveJsonFile(RESULTS+'eval.json', results);
}

async function getEvaluation(song: string, points: any[][][],
    msaFile: string, alignments: Alignments) {
  //get original chord sequence
  const originalChords = points.map(ps => ps.map(p => pcSetToLabel(p.slice(1)[0])));
  //calculate labels of harmonic essence
  const msaModeLabels = await getTimelineModeLabels(points, msaFile, alignments);
  const graphBasedLabels = await getTimelineSectionModeLabels(points, msaFile,
    alignments, NUM_CONNECTIONS, MASK_THRESHOLD);
  const timeline = (await getPartitionFromMSAResult(points, msaFile, alignments))
    .getPartitions();
  //annotate individual versions
  const modeLabelChords = annotateIndividuals(originalChords, timeline, msaModeLabels);
  const graphLabelChords = annotateIndividuals(originalChords, timeline, graphBasedLabels);
  //align with leadsheets
  const leadsheet = DATASET+'leadsheets/'+song+'.json';
  const original = originalChords.map(c => getAlignmentPs(c, leadsheet));
  const tlModes = modeLabelChords.map(c => getAlignmentPs(c, leadsheet));
  const tlGraph = graphLabelChords.map(c => getAlignmentPs(c, leadsheet));
  const msa = getAlignmentPs(msaModeLabels, leadsheet);
  const graph = getAlignmentPs(graphBasedLabels, leadsheet);
  return {
    originalGround: _.mean(original.map(o => o.groundP)),
    originalSeq: _.mean(original.map(o => o.seqP)),
    tlModesGround: _.mean(tlModes.map(o => o.groundP)),
    tlModesSeq: _.mean(tlModes.map(o => o.seqP)),
    tlGraphGround: _.mean(tlGraph.map(o => o.groundP)),
    tlGraphSeq: _.mean(tlGraph.map(o => o.seqP)),
    msaGround: msa.groundP,
    msaSeq: msa.seqP,
    graphGround: graph.groundP,
    graphSeq: graph.seqP
  }
}

function annotateIndividuals(originalChords: string[][],
    timeline: SegmentNode[][], labels: string[]) {
  return originalChords.map((cs,i) => cs.map((c,j) => {
    const index = timeline.findIndex(t =>
      t.find(n => n.version == i && n.time == j) != null);
    return index >= 0 ? labels[index] : c;
  }));
}

function getAlignmentPs(sequence: string[], leadSheetFile: string) {
  const groundtruth = getStandardChordSequence(leadSheetFile, true);
  const vocab = _.uniq(_.concat(groundtruth, sequence));
  const numeric = (s: string[]) => s.map(v => [vocab.indexOf(v)]);
  const path = getSimpleSmithWatermanPath(numeric(groundtruth), numeric(sequence), {});
  return {groundP: path.length/groundtruth.length, seqP: path.length/sequence.length};
}

