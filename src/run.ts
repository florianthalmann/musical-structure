import * as _ from 'lodash';
//import { saveGdHists } from './histograms';
import { QUANT_FUNCS as QF } from 'siafun';
import { GdExperiment } from './run-gd';
import { AlignmentAlgorithm } from './analysis/timeline-analysis';
import { FEATURES } from './files/feature-extractor';


export function getSongOptions(name: string, subfolder?: string, extension?: string) {
  return {results: name.replace(/\s/g,'').replace(/\'/g,''), collectionName: name,
    subfolder: subfolder, extension: extension};
}

const CURRENT_SONG =
getSongOptions("me and my uncle", "me_and_my_uncle/");
//getSongOptions("box of rain", "box_of_rain/");
//getSongOptions("good lovin'", "good_lovin'/");
//getSongOptions("cosmic charlie", "cosmic_charlie/");
//getSongOptions("dark star", "dark_star/");

const RESULTS_PATH = "results/tuning-test/";
const CURRENT_OPTIONS = (mv: number, variant?: string) => Object.assign(CURRENT_SONG, {
  filebase: RESULTS_PATH + CURRENT_SONG.results + mv + variant,
  maxVersions: mv,
  count: 0,
  algorithm: AlignmentAlgorithm.SW,
  includeSelfAlignments: true,
  featureOptions: {
    selectedFeatures: [FEATURES.MADMOM_BARS, FEATURES.JOHAN_CHORDS],
    quantizerFunctions: [QF.ORDER(), QF.IDENTITY()]
  }
});

////try cosmic charlie again with maxV 30, count 10, SW, false
//saveMultiTimelineDecomposition(CURRENT_OPTIONS(30));

const options = CURRENT_OPTIONS(100, "j1");
new GdExperiment(options.subfolder).analyzeTuned(options);

//saveGdRawSequences(CURRENT_OPTIONS(100, "t"));
//saveGdMultinomialSequences(CURRENT_OPTIONS(100));
//saveGdFastaSequences(CURRENT_OPTIONS(100));
//saveSimilarityMatrices(CURRENT_OPTIONS(100, "c"));

//saveTimelineFromMSAResults(CURRENT_OPTIONS(100, "c"))//, true);
//saveRatingsFromMSAResults(CURRENT_OPTIONS(100), true);

//analyzeSavedTimeline(CURRENT_OPTIONS);

//saveThomasSongAlignments()

//gatherTunings('../musical-structure/thomas/')

//saveAllSongSequences(4, 10, 10);
//saveThomasSongSequences()
///calculateCompressionDistances(19, 10);

//analyzePatternGraph("results/graphs/good lovin'madbarsdouble.json", 10);
//analyzePatternGraph("results/graphs/good lovin'-hybrid0.json");
//analyzePatternGraph("results/graphs/good lovin'-hybrid1.json");
//analyzePatternGraph("results/graphs/good lovin'-hybrid2.json");
//analyzePatternGraph("results/gd/goodlovin-chroma4bars-vecs.json");

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
