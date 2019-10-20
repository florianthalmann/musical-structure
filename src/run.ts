import * as _ from 'lodash';
//import { saveGdHists } from './histograms';
import { saveHybridPatternGraphs, savePatternSequences, saveVectorSequences,
  savePatternAndVectorSequences, saveAllSongSequences, saveThomasSongSequences,
  analyzeHybridPatternGraphs, savePS, saveSWPatternAndVectorSequences,
  saveHybridSWPatternGraph, saveHybridSWSegmentTimeline, saveThomasSongAlignments } from './run-gd';
import { calculateCompressionDistances, calculatePatternSimilarities,
  sweep, saveSimilarities, sweep2} from './run-gd-dists';

import { analyzePatternGraph } from './graphs/pattern-stats';
import { cleanCaches, renameJohanChordFeatures, moveToFeaturesDir } from './files/file-manager';
import { gatherTunings } from './files/tunings';


/*fs.writeFileSync('connections3.json', JSON.stringify(
  getConnectednessRatings(JSON.parse(fs.readFileSync(
    SALAMI_SSD+'chroma3bars/lma-audio_955_mp3/cosiatec_2_0_3_true.json', 'utf8')))));*/

//cleanCaches('/Volumes/FastSSD/salami/chroma4beats', 'cosiatec');
//renameJohanChordFeatures();
//moveToFeaturesDir('madbars/');

/*saveGdHists([FEATURES.BEATS, FEATURES.CHROMA], [QF.ORDER(), QF.ABOVE_STD()], 'hists3chSB.json');*/
//histsToGraph();

//saveHybridPatternGraphs(3)
//savePatternGraphs("madbarsdouble")
//saveVectorSequences("plots/d3/newest/qmtrans.json")
//savePatternSequences("plots/d3/newest/sequences5m.json", 5, "madmom");
//savePatternAndVectorSequences("plots/d3/latest/goodlovin-johanflobars-double", false);
//savePatternAndVectorSequences("plots/d3/latest/box of rain", false, "box of rain", ".m4a");
//saveHybridPatternGraphs("plots/d3/latest/box of rain", "box of rain", ".m4a", 2, 5);
//analyzeHybridPatternGraphs("plots/d3/latest/box of rain", 3, 5)
//calculatePatternSimilarities();

//sweep();
//saveSimilarities('plots/d3/graphs_jo4_min3/bestgd_jaccard_.8_1_555.json', 56)
//savePS('plots/d3/latest/cosmic charlie 2', 'plots/d3/graphs_jo4_min3/cosiatecs555.json', 'plots/d3/graphs_jo4_min3/bestgd_jaccard_.8_1_555.json')

//sweep2();

//saveSWPatternAndVectorSequences("plots/d3/latest/box of rain-sw", false, "box of rain", ".m4a");
//saveHybridSWPatternGraph("plots/d3/latest/box of rain-sw", "box of rain", ".m4a", 1)

//saveHybridSWSegmentTimeline("results/boxofrain", "box of rain", ".m4a", 5) //[ 156, 178, 154, 156, 157, 156, 155, 155, 163, 163 ]
saveHybridSWSegmentTimeline("results/timeline/meandmyuncle30c", "me and my uncle", ".mp3", 5) //[ 135, 92, 90, 99, 99, 171, 87, 89, 89, 87 ]
//saveHybridSWSegmentTimeline("results/goodlovin30", "good lovin'", ".mp3", 5)
//saveHybridSWSegmentTimeline("results/cosmiccharlie30", "cosmic charlie", ".mp3", 5)

//saveThomasSongAlignments()

//gatherTunings('tunings/')

//saveAllSongSequences(4, 10, 10);
//saveThomasSongSequences()
///calculateCompressionDistances(19, 10);

//analyzePatternGraph("results/graphs/good lovin'madbarsdouble.json", 10);
//analyzePatternGraph("results/graphs/good lovin'-hybrid0.json");
//analyzePatternGraph("results/graphs/good lovin'-hybrid1.json");
//analyzePatternGraph("results/graphs/good lovin'-hybrid2.json");
//analyzePatternGraph("results/gd/goodlovin-chroma4bars-vecs.json");
