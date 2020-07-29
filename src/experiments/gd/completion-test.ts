
import { TimelineAnalysis } from '../../analysis/timeline-analysis';
import { getSwOptions } from '../../files/options';
import { hmmAlign } from '../../models/models';
import { getSongFoldersAndOptions, getMSAFolder, getTunedAudioFiles } from './util';
import { GdOptions } from './config';

async function completionTest(song: string, tlo: GdOptions) {
  let [folders, options] = getSongFoldersAndOptions(tlo, song);
  options.audioFiles = getTunedAudioFiles(song, tlo.count);
  options = Object.assign(options,
    {featuresFolder: folders.features, patternsFolder: folders.patterns});
  const swOptions = getSwOptions(folders.patterns, options.featureOptions);
  const analysis = new TimelineAnalysis(options, swOptions);
  const pointsFile = options.filebase+"-points.json";
  const msaFile = await hmmAlign(pointsFile, getMSAFolder(options));
  const timeline = await analysis.getTimelineFromMSAResult(msaFile);
  //console.log(_.flatten(timeline.getPartitions()).length)
  await analysis.saveTimelineVisuals(timeline);
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