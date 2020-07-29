import * as _ from 'lodash';
import { getSimpleSmithWatermanPath } from 'siafun';
import { mapSeries } from '../../files/util';
import { loadJsonFile } from '../../files/file-manager';
import { getStandardChordSequence } from '../../files/leadsheets';
import { TimelineAnalysis } from '../../analysis/timeline-analysis';
import { GdOptions } from './config';
import { getSongFoldersAndOptions, getTunedSongs } from './util';


export async function getAllSWEvals(song: string, analysis: TimelineAnalysis,
    options: GdOptions, msaFile: string, numConns: number,
    maskThreshold: number) {
  //await analysis.saveTimelineFromMSAResults(msaFile);
  const tlModeLabels = await analysis.getTimelineModeLabels(msaFile);
  const tlGraphLabels = await analysis.getTimelineSectionModeLabels(msaFile, numConns, maskThreshold);
  const timeline = (await analysis.getPartitionFromMSAResult(msaFile)).getPartitions();
  const chords: string[][] = loadJsonFile(options.filebase+'-chords.json');
  const adjustedChords = chords.map((cs,i) => cs.map((c,j) => {
    const index = timeline.findIndex(t =>
      t.find(n => n.version == i && n.time == j) != null);
    return index >= 0 ? tlModeLabels[index] : c;
  }));
  const adjustedChords2 = chords.map((cs,i) => cs.map((c,j) => {
    const index = timeline.findIndex(t =>
      t.find(n => n.version == i && n.time == j) != null);
    return index >= 0 ? tlGraphLabels[index] : c;
  }));

  const original = chords.map(c => getEvaluation(c, "data/gd_chords/"+song+".json"));
  const tlModes = adjustedChords.map(c => getEvaluation(c, "data/gd_chords/"+song+".json"));
  const tlGraph = adjustedChords2.map(c => getEvaluation(c, "data/gd_chords/"+song+".json"));
  const msa = getEvaluation(tlModeLabels, "data/gd_chords/"+song+".json");
  const graph = getEvaluation(tlGraphLabels, "data/gd_chords/"+song+".json")

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

function evaluateSeparateChords(tlo: GdOptions, songs = getTunedSongs(), statsFile: string) {
  mapSeries(songs, async song => {
    let [_folders, options] = getSongFoldersAndOptions(tlo, song);
    const chords: string[][] = loadJsonFile(options.filebase+'-chords.json');
    const evals = chords.map(c =>
      getEvaluation(c, "data/gd_chords/"+song+".json"));
    console.log(JSON.stringify(evals.map(e => e.groundP)));
  });
}

function evaluate(outputFile: string, leadsheetFile: string) {
  const groundtruth =  getStandardChordSequence(leadsheetFile, true);
  const result: string[] = _.flattenDeep(loadJsonFile(outputFile));
  console.log(JSON.stringify(groundtruth));
  console.log(JSON.stringify(result));
  const vocab = _.uniq(_.concat(groundtruth, result));
  const numeric = (s: string[]) => s.map(v => [vocab.indexOf(v)]);
  const path = getSimpleSmithWatermanPath(numeric(groundtruth), numeric(result), {
    //fillGaps?: boolean,
    //onlyDiagonals: true
  });
  //console.log(JSON.stringify(path.map(([i,j]) => [groundtruth[i], result[j]])));
  console.log(groundtruth.length, result.length, path.length)
  console.log(path.length/groundtruth.length, path.length/result.length)
  return outputFile
}

function getEvaluation(sequence: string[], leadSheetFile: string) {
  const groundtruth =  getStandardChordSequence(leadSheetFile, true);
  const vocab = _.uniq(_.concat(groundtruth, sequence));
  const numeric = (s: string[]) => s.map(v => [vocab.indexOf(v)]);
  const path = getSimpleSmithWatermanPath(numeric(groundtruth), numeric(sequence), {});
  return {groundP: path.length/groundtruth.length, seqP: path.length/sequence.length};
}