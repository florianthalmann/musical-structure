import * as _ from 'lodash';
import { QUANT_FUNCS as QF } from 'siafun';
import { FEATURES } from './feature-extractor';
import { saveGdHists } from './histograms';
//import { cleanCaches } from './file-manager';



/*fs.writeFileSync('connections3.json', JSON.stringify(
  getConnectednessRatings(JSON.parse(fs.readFileSync(
    SALAMI_SSD+'chroma3bars/lma-audio_955_mp3/cosiatec_2_0_3_true.json', 'utf8')))));*/

//gdJob();
//dayJob();
//nightJob();
//cleanCaches('/Volumes/FastSSD/salami/chroma4beats', 'cosiatec');

saveGdHists(["good lovin'", "sugar magnolia", "me and my uncle"],
  [FEATURES.BEATS, FEATURES.CHROMA], [QF.ORDER(), QF.ABOVE_STD()], 'hists3chSB.json');
//histsToGraph();


