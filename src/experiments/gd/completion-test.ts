import { initDirRec } from '../../files/file-manager';
import { saveMultinomialSequences } from '../../files/sequences';
import { getPartitionFromMSAResult } from '../../analysis/timeline-analysis';
import { hmmAlign } from '../../models/models';
import { getBeatwiseChords, getBeatwiseChordSWAlignments,
  getTunedAudioFiles } from './util';

const RESULTS = initDirRec('./results/completion-test2/');

completionTest("box_of_rain");

async function completionTest(song: string) {
  const versions = getTunedAudioFiles(song, 100);
  const points = (await getBeatwiseChords([song]))[0];
  const seqsFile = RESULTS+song+"-seqs.json";
  await saveMultinomialSequences(points, seqsFile);
  const msaFile = await hmmAlign(seqsFile, RESULTS);
  const alignments = getBeatwiseChordSWAlignments(song, points, versions, 0);
  const timeline = getPartitionFromMSAResult(points, msaFile, alignments);
  //console.log(_.flatten(timeline.getPartitions()).length)
  /*const segsByTypes = await analysis.getStructure(timeline);
  const graph = timeline.getGraph();
  const missing = _.differenceBy(graph.getNodes(), _.flatten(segsByTypes), n => n.id);
  console.log("timeline", _.flatten(timeline.getPartitions()).length)
  console.log("missing", missing.length)
  addSegmentsAtBestSpots(missing, timeline, undefined, true);
  console.log("timeline2", _.flatten(timeline.getPartitions()).length);
  await analysis.saveTimelineVisuals(timeline, options.filebase+'-visuals2.json');
  /*console.log(_.mean(missing.map(m => pruned.getAdjacents(m).length)))
  const locations = missing.map(m => pruned.getAdjacents(m)
    .map(n => _.findIndex(partitions, p => p.find(o => o.id === n.id) != null))
    .filter(i => i != null && i >= 0 && !partitions[i].find(o => o.id === m.id)));
  console.log(JSON.stringify(locations.slice(0,50)));
  //see where it can be added to timeline (maintain order and check if empty...)
  let candidates = locations.map(l => _.uniq(l).length == 1 && l.length > 1 ? l[0] : null);
  candidates.map((c,i) => c != null
    && partitions[c].find(n => n.version === missing[i].version));
  console.log(candidates.filter(c => c).length)
  //await analysis.saveTimelineVisuals(timeline, tlo.filebase+'-visuals2.json')
  console.log(locations.map(l => _.uniq(l).length == 1 && l.length > 1).filter(l => l).length);
  //then, see if can be added to segment types*/
}