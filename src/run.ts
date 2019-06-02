import * as _ from 'lodash';
//import { saveGdHists } from './histograms';
import { savePatternGraphs, saveHybridPatternGraphs } from './run-gd';
//import { cleanCaches, renameJohanChordFeatures } from './file-manager';


/*fs.writeFileSync('connections3.json', JSON.stringify(
  getConnectednessRatings(JSON.parse(fs.readFileSync(
    SALAMI_SSD+'chroma3bars/lma-audio_955_mp3/cosiatec_2_0_3_true.json', 'utf8')))));*/

//cleanCaches('/Volumes/FastSSD/salami/chroma4beats', 'cosiatec');
//renameJohanChordFeatures();

/*saveGdHists(["good lovin'", "sugar magnolia", "me and my uncle"],
  [FEATURES.BEATS, FEATURES.CHROMA], [QF.ORDER(), QF.ABOVE_STD()], 'hists3chSB.json');*/
//histsToGraph();

saveHybridPatternGraphs(3)
//savePatternGraphs()

//analyzePatternGraph("good lovin'.json");
//analyzePatternGraph("results/gd/goodlovin-chroma4bars-vecs.json");