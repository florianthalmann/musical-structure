import * as _ from 'lodash';
import { QUANT_FUNCS as QF, getSimpleSmithWatermanPath } from 'siafun';
import { FEATURES } from '../../files/feature-extractor';
import { extractAlignments, AlignmentAlgorithm } from '../../analysis/alignments';
import { FullSWOptions, FeatureOptions } from '../../files/options';
import { mapSeries } from '../../files/util';
import { pcSetToLabel } from '../../files/theory';
import { saveRawSequences } from '../../files/sequences';
import { getStandardChordSequence } from '../../files/leadsheets';
import { getTimelineModeLabels, getTimelineSectionModeLabels,
  getPartitionFromMSAResult } from '../../analysis/timeline-analysis';
import { hmmAlign, MSAOptions, MSA_LENGTH } from '../../models/models';
import { GD_RAW, GD_RESULTS } from './config';
import { getTunedSongs, getTunedAudioFiles, getPoints } from './util';

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
  selectedFeatures: [FEATURES.MADMOM_BEATS, FEATURES.GO_CHORDS],
  quantizerFunctions: [QF.ORDER(), QF.IDENTITY()]
}

const SW_CONFIG: FullSWOptions = {
  //TODO: REMOVE FEATURES!!
  selectedFeatures: [FEATURES.MADMOM_BEATS, FEATURES.GO_CHORDS],
  quantizerFunctions: [QF.ORDER(), QF.IDENTITY()],
  maxIterations: 1,
  minSegmentLength: 16,
  nLongest: 10,
  maxGapSize: 4,
  //maxGapRatio: 0.25,
  minDistance: 4,
  cacheDir: GD_RAW.patterns+'gochordsmadbeats'
}

const NUM_ALIGNMENTS = 5;
const NUM_CONNECTIONS = 1;
const MASK_THRESHOLD = .1;

const FILEBASE = GD_RESULTS+'ismir2020/';

run();

async function run() {
  mapSeries(getTunedSongs(), async s => {
    console.log('working on '+s);
    const versions = getTunedAudioFiles(s);
    const points = await getPoints(versions, FEATURE_CONFIG);
    
    console.log('saving feature sequences')
    const pointsFile = FILEBASE+s+"-points.json";
    saveRawSequences(points, pointsFile);
    const msaFile = await hmmAlign(pointsFile, FILEBASE+"-msa.json", MSA_CONFIG);
    const originalChords = points.map(ps => ps.map(p => pcSetToLabel(p.slice(1)[0])));
    
    const alignments = extractAlignments({
      collectionName: s,
      patternsFolder: GD_RAW.patterns,
      algorithm: AlignmentAlgorithm.SW,
      points: points,
      audioFiles: versions,
      swOptions: SW_CONFIG,
      numTuplesPerFile: NUM_ALIGNMENTS,
      tupleSize: 2
    })
    
    const tlModeLabels = await getTimelineModeLabels(points, msaFile, alignments);
    const tlGraphLabels = await getTimelineSectionModeLabels(points, msaFile,
      alignments, NUM_CONNECTIONS, MASK_THRESHOLD);
    const timeline = (await getPartitionFromMSAResult(points, msaFile, alignments)).getPartitions();
    const adjustedChords = originalChords.map((cs,i) => cs.map((c,j) => {
      const index = timeline.findIndex(t =>
        t.find(n => n.version == i && n.time == j) != null);
      return index >= 0 ? tlModeLabels[index] : c;
    }));
    const adjustedChords2 = originalChords.map((cs,i) => cs.map((c,j) => {
      const index = timeline.findIndex(t =>
        t.find(n => n.version == i && n.time == j) != null);
      return index >= 0 ? tlGraphLabels[index] : c;
    }));

    const original = originalChords.map(c => getEvaluation(c, "data/gd_chords/"+s+".json"));
    const tlModes = adjustedChords.map(c => getEvaluation(c, "data/gd_chords/"+s+".json"));
    const tlGraph = adjustedChords2.map(c => getEvaluation(c, "data/gd_chords/"+s+".json"));
    const msa = getEvaluation(tlModeLabels, "data/gd_chords/"+s+".json");
    const graph = getEvaluation(tlGraphLabels, "data/gd_chords/"+s+".json")

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
  });
}

function getEvaluation(sequence: string[], leadSheetFile: string) {
  const groundtruth = getStandardChordSequence(leadSheetFile, true);
  const vocab = _.uniq(_.concat(groundtruth, sequence));
  const numeric = (s: string[]) => s.map(v => [vocab.indexOf(v)]);
  const path = getSimpleSmithWatermanPath(numeric(groundtruth), numeric(sequence), {});
  return {groundP: path.length/groundtruth.length, seqP: path.length/sequence.length};
}

