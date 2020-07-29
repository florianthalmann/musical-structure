import * as _ from 'lodash';
import { loadJsonFile } from '../../files/file-manager';
import { mapSeries, cartesianProduct } from '../../files/util';
import { getSwOptions } from '../../files/options';
import { TimelineAnalysis } from '../../analysis/timeline-analysis';
import { getFactorNames } from '../../analysis/sequence-heuristics';
import { getStandardDeviation, getMedian } from '../../analysis/util';
import { hmmAlign, MSAOptions, getModel, MSA_LENGTH } from '../../models/models';
import { Experiment } from '../../files/experiment';
import { GdOptions } from './config';
import { getTunedSongs, getSongFoldersAndOptions, getMSAFolder,
  getTunedAudioFiles } from './util';
import { getAllSWEvals } from './shared-structure';


async function fullSweep(tlo: GdOptions, songs = getTunedSongs(), statsFile: string) {
  const msaConfigs = <MSAOptions[]><any>getSweepConfigs<number|string>({
    //best: median, 1, 0.8/0.8, 0.999/0.01, undefined
    modelLength: [MSA_LENGTH.MEDIAN],//[MSA_LENGTH.MIN,MSA_LENGTH.MEDIAN,MSA_LENGTH.MEAN,MSA_LENGTH.THIRD_QUARTILE,MSA_LENGTH.MAX],
    iterations: [1],
    edgeInertia: [0.8],//[0, 0.2, 0.4, 0.6, 0.8, 1],
    distInertia: [0.8],//[0, 0.2, 0.4, 0.6, 0.8, 1],//[0.8, 0.85, 0.9, 0.95],//[0, 0.2, 0.4, 0.6, 0.8, 1],
    matchMatch: [0.999],//[0.6,0.7,0.8,0.9,0.99,0.999,0.9999,0.999999],//[0.7,0.8,0.9, 0.99, 0.999, 0.9999, 0.99999, 0.999999, 1],//[0.999],//0.999,0.999999],//[0.9, 0.99, 0.999, 0.9999, 0.99999, 0.999999, 1],//[0.99995],//[0.99980, 0.99985, 0.99990, 0.99995, 0.999975, 1],
    deleteInsert: [0.01],//[0.001,0.01,0.05,0.1,0.2,0.3,0.4,0.5],//0.1],//[0.2, 0.1, 0.01, 0.001],
    flankProb: [undefined]//, 0.99]//, 0.6, 0.7, 0.8, 0.9, 0.999, 0.999999]
  });
  const swConfigs = getSweepConfigs({
    maxIterations: [1],//true,
    //similarityThreshold: .95,
    minSegmentLength: [16], //only take segments longer than this
    //maxThreshold: [50], //stop when max value below this
    nLongest: [10],//[10]
    maxGapSize: [4],
    //maxGaps: 5,
    maxGapRatio: [0.25],
    minDistance: [4]
  });
  const sectionConfig = {
    numConns: 1,
    maskThreshold: .1
  };

  const ratingFactorNames = getFactorNames();
  const evalNames = ["originalGround", "originalSeq", "tlModesGround",
    "tlModesSeq", "tlGraphGround", "tlGraphSeq", "msaGround", "msaSeq",
    "graphGround", "graphSeq"];
  const resultNames = ["stateCount", "avgStateP", "probStates", "logP",
    "trackP", "rating"].concat(ratingFactorNames).concat(evalNames);
  mapSeries(songs.filter(s => !_.includes(['brokedown_palace','friend_of_the_devil',
      'mountains_of_the_moon','west_l.a._fadeaway'], s)),
      async song => mapSeries(swConfigs, async swConfig => {
    let [folders, options] = getSongFoldersAndOptions(tlo, song);
    options.audioFiles = await getTunedAudioFiles(song, tlo.count);
    options = Object.assign(options,
      {featuresFolder: folders.features, patternsFolder: folders.patterns});
    const swOptions = getSwOptions(folders.patterns,
      options.featureOptions, swConfig);

    const analysis = new TimelineAnalysis(options, swOptions);

    console.log('saving feature sequences')
    if (options.multinomial) await analysis.saveMultinomialSequences(true);
    else await analysis.saveRawSequences();
    await analysis.saveIndividualChordSequences(true);

    const points = options.filebase+"-points.json";

    const swColumns = _.clone(swOptions);
    delete swColumns.selectedFeatures;//these are either logged in song field or irrelevant...
    delete swColumns.quantizerFunctions;
    delete swColumns.cacheDir;

    const songWithExt = options.filebase.split('/').slice(-1)[0];
    const configs = msaConfigs.map(c =>
      Object.assign({song: songWithExt, model: getModel(c)}, c, swColumns, sectionConfig));

    await new Experiment("msa sweep "+song+" ",
      configs,
      async i => {
        const msaFile = await hmmAlign(points, getMSAFolder(options),
          msaConfigs[i]);
        const stats = getMSAStats(msaFile);
        const rating = await analysis.getRatingsFromMSAResult(msaFile);
        const allSWEvals = await getAllSWEvals(song, analysis, options,
          msaFile, sectionConfig.numConns, sectionConfig.maskThreshold);
        console.log(allSWEvals)
        return _.zipObject(resultNames,
          [stats.totalStates, _.mean(stats.statePs), stats.probableStates,
            _.mean(stats.logPs), _.mean(stats.trackPs), rating.rating,
            ...ratingFactorNames.map(f => rating.factors[f]),
            ...evalNames.map(e => allSWEvals[e])]);
      }).run(statsFile);

    /*await mapSeries(configs, async c => {
      const msaFile = await hmmAlign(points, getMSAFolder(options), c);
      await analysis.saveTimelineFromMSAResults(msaFile);
      //TODO SAVE STRUCTURE NOW!! AAND::: NO LOADING OF OUTFILE, NEEDS TO BE CALCULATED
      analysis.getStructure();
    });*/
  }));
}

async function printOverallMSAStats(tlo: GdOptions) {
  const songs = getTunedSongs();
  const filebases = songs.map(s =>
    getSongFoldersAndOptions(tlo, s)[1].filebase);

  const stats = await mapSeries(filebases, async f => getMSAStats(f+"-msa.json"));
  console.log("tracks", _.sum(stats.map(s => s.probableTracks)), "of",
    _.sum(stats.map(s => s.totalTracks)));
  console.log("states", _.sum(stats.map(s => s.probableStates)), "of",
    _.sum(stats.map(s => s.totalStates)));
  console.log("trackP", _.mean(_.flatten(stats.map(s => s.trackPs))));
  console.log("stateP", _.mean(_.flatten(stats.map(s => s.statePs))));

  const analyses = await mapSeries(songs, async s => {
    const [folders, options] = getSongFoldersAndOptions(tlo, s);
    options.audioFiles = await getTunedAudioFiles(s, options.count);
    return new TimelineAnalysis(Object.assign(options,
      {featuresFolder: folders.features, patternsFolder: folders.patterns}));
  });
  const ratings = await mapSeries(analyses, async a => a.getPartitionRating());
  console.log("rating", _.mean(ratings), getMedian(ratings));
}

function printMSAStats(filepath: string, full?: boolean) {
  const stats = getMSAStats(filepath);
  if (full) {
    printStats("logPs:", stats.logPs);
    printStats("trackPs:", stats.trackPs);
    printStats("statePs:", stats.statePs);
  }
  console.log("probable tracks:", stats.probableTracks, "of", stats.totalTracks);
  console.log("probable states:", stats.probableStates, "of", stats.totalStates);
}

function printStats(name: string, values: number[]) {
  console.log(name+":", "["+_.min(values)+", "+_.max(values)+"]",
    _.mean(values), getStandardDeviation(values));
}

function getMSAStats(filepath: string) {
  const json = loadJsonFile(filepath);
  const msa: string[][] = json["msa"];
  const logPs: number[] = json["logp"];
  const trackPs = msa.map(m => m.filter(s => s != "").length/m.length);
  const matchStates = _.sortBy(_.uniq(_.flatten(msa))
    .filter(s => s.length > 0), s => parseInt(s.slice(1)));
  const statePs = matchStates.map(m =>
    _.sum(msa.map(v => v.filter(s => s === m).length))/msa.length);
  const numProbTracks = trackPs.filter(p => p > 0.5).length;
  const numProbStates = statePs.filter(p => p > 0.5).length;
  return {totalTracks: msa.length, totalStates: matchStates.length,
    logPs: logPs, trackPs: trackPs, statePs: statePs,
    probableTracks: numProbTracks, probableStates: numProbStates};
}

function getSweepConfigs<T>(configs: _.Dictionary<T[]>): _.Dictionary<T>[] {
  const product = cartesianProduct(_.values(configs));
  return product.map(p => _.zipObject(Object.keys(configs), p));
}