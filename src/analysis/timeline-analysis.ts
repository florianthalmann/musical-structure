import * as fs from 'fs';
import * as _ from 'lodash';
import { pointsToIndices, StructureResult, MultiStructureResult, getCosiatec,
  getSmithWaterman, getDualSmithWaterman, getMultiCosiatec, getSelfSimilarityMatrix,
  Quantizer } from 'siafun';
import { mapSeries, updateStatus, audioPathToDirName } from '../files/util';
import { loadJsonFile, saveJsonFile, saveTextFile, loadTextFile } from '../files/file-manager';
import { NodeGroupingOptions } from '../graphs/graph-analysis';
import { loadGraph, DirectedGraph } from '../graphs/graph-theory';
import { GraphPartition } from '../graphs/graph-partition';
import { getOptionsWithCaching, getSiaOptions, getSwOptions,
  FullSIAOptions, FullSWOptions, FeatureOptions } from '../files/options';
import { FeatureLoader } from '../files/feature-loader';
import { createSimilarityPatternGraph, getPatternGroupNFs, getNormalFormsMap,
  getConnectednessByVersion, PatternNode } from '../analysis/pattern-analysis';
import { getTimelineFromAlignments, getTimelineFromMSA, getMSAPartitions,
  createSegmentGraphFromAlignments } from '../analysis/segment-analysis';
import { getSequenceRatingWithFactors, getSequenceRatingFromMatrix } from '../analysis/sequence-heuristics';
import { SegmentNode } from '../analysis/types';
import { inferStructureFromTimeline, getSectionGroupsFromTimelineMatrix } from '../analysis/structure-analysis';
import { getThomasTuningRatio } from '../files/tuning';
import { getMostCommonPoints } from '../analysis/pattern-histograms';
import { toIndexSeqMap } from '../graphs/util';
import { pcSetToLabel } from '../files/theory';
import { getMedian, getMode } from './util';

export enum AlignmentAlgorithm {
  SIA,
  SW,
  BOTH
}

export interface TimelineOptions {
  filebase?: string,
  collectionName: string,
  extension?: string,
  count?: number,
  algorithm?: AlignmentAlgorithm,
  featureOptions?: FeatureOptions,
  multinomial?: boolean,
  includeSelfAlignments?: boolean,
  maxVersions?: number,
  maxPointsLength?: number,
  audioFiles?: string[],
  featuresFolder?: string,
  patternsFolder?: string
}

interface MultinomialSequences {
  data: number[][],
  labels: string[]
}

interface RawSequences {
  data: number[][][]
}

interface Alignments {
  versionTuples: [number, number][],
  alignments: MultiStructureResult[],
  versions: string[],
  versionPoints: any[][][]
}

interface VisualsPoint {
  version: number,
  time: number,
  type: number,
  point: number[],
  path: string,
  start: number,
  duration: number
}

interface Segment {
  start: number,
  duration: number
}

export class TimelineAnalysis {
  
  private siaOptions: FullSIAOptions;
  private points: Promise<any[][][]>;
  private alignments: Promise<Alignments>;
  private alignmentGraph: DirectedGraph<SegmentNode>;
  
  constructor(private tlo: TimelineOptions, private swOptions?: FullSWOptions) {
    this.siaOptions = getSiaOptions(tlo.patternsFolder, tlo.featureOptions);
    this.swOptions = this.swOptions
      || getSwOptions(tlo.patternsFolder, tlo.featureOptions);
  }

  async saveSimilarityMatrices() {
    const sequences = (await this.getPoints())
      .map(s => s.map(p => p[1]).filter(p=>p));
    const matrixes = sequences.map(s => getSelfSimilarityMatrix(s));
    saveJsonFile(this.tlo.filebase+'-ssm.json', matrixes);
  }
  
  async saveMultinomialSequences(force?: boolean) {
    if (force || !fs.existsSync(this.tlo.filebase+'-points.json')) {
      saveJsonFile(this.tlo.filebase+'-points.json',
        await this.getMultinomialSequences());
    }
  }

  async saveIndividualChordSequences(force?: boolean) {
    if (force || !fs.existsSync(this.tlo.filebase+'-chords.json')) {
      const points = await this.getPoints();
      const chords = points.map(ps => ps.map(p => pcSetToLabel(p.slice(1)[0])));
      console.log(JSON.stringify(chords.map(cs => cs.filter(c => c === "Dm").length)))
      const lengths = chords.map(cs => cs.length);
      const median = getMedian(lengths)
      const index = _.findIndex(lengths, l => l == median);
      console.log(JSON.stringify(chords[index].filter(c => c === "Dm").length))
      saveJsonFile(this.tlo.filebase+'-chords.json', chords);
    }
  }

  async saveFastaSequences(force?: boolean) {
    if (force || !fs.existsSync(this.tlo.filebase+'.fa')) {
      const data = (await this.getMultinomialSequences()).data;//[16,25])).data;
      const fasta = _.flatten(data.map((d,i) => [">version"+i,
        d.map(p => String.fromCharCode(65+p)).join('')])).join("\n");
      saveTextFile(this.tlo.filebase+'.fa', fasta);
    }
  }
  
  private async getMultinomialSequences(exclude?: number[]): Promise<MultinomialSequences> {
    let points = await this.getPoints();
    /*points.forEach(p => console.log(JSON.stringify(
      _.reverse(_.sortBy(
        _.map(_.groupBy(p.map(s => JSON.stringify(s.slice(1)))), (v,k) => [k,v.length])
    , a => a[1])).slice(0,3))));*/
    points = exclude ? points.filter((_v,i) => !_.includes(exclude, i)) : points;
    const values = points.map(s => s.map(p => JSON.stringify(p.slice(1))));
    const distinct = _.uniq(_.flatten(values));
    const data = values.map(vs => vs.map(v => distinct.indexOf(v)));
    return {data: data, labels: distinct};
  }

  async saveRawSequences(force?: boolean) {
    if (force || !fs.existsSync(this.tlo.filebase+'-points.json')) {
      const points = await this.getPoints();
      const sequences = {data: points.map(s => s.map(p => p[1]).filter(p=>p))};
      saveJsonFile(this.tlo.filebase+'-points.json', sequences);
    }
  }

  async saveTimelineFromMSAResults(file?: string, fasta?: boolean, force?: boolean) {
    if (force || !fs.existsSync(this.tlo.filebase+'-output.json')) {
      const points = await this.getPoints();
      const msa = this.loadMSA(file, fasta);
      const alignments = await this.getAlignments();
      const timeline = getTimelineFromMSA(msa, points, alignments.versionTuples,
        alignments.alignments);
      await this.saveOutput(timeline, alignments.versions);
      await this.saveTimelineVisuals(timeline, alignments.versions);
    }
  }
  
  async saveSumSSMfromMSAResults(fasta?: boolean, force?: boolean) {
    if (force || !fs.existsSync(this.tlo.filebase+'-sssm.json')) {
      const points = this.loadPoints(this.tlo.filebase+'-points.json');
      const msa = this.loadMSA(undefined, fasta);
      const partitions = getMSAPartitions(msa, points)//.filter(p => p.length > 10);
      const ssms = points.map(s => getSelfSimilarityMatrix(s));
      const sssm = partitions.map(p => partitions.map(q =>
        _.reduce(_.range(0, points.length).map(i => {
          const s = p.filter(s => s.version == i)[0];
          const t = q.filter(s => s.version == i)[0];
          return s && t ? ssms[i][s.time][t.time] : 1
        }), _.multiply, 1)));
      saveJsonFile(this.tlo.filebase+'-sssm.json', sssm);
    }
  }
  
  private loadPoints(path: string): number[][][] {
    let loaded = loadJsonFile(path);
    if (loaded.labels) {
      const sequences = <MultinomialSequences>loaded;
      const labelPoints = sequences.labels.map(l => _.flatten(<number[]>JSON.parse(l)));
      return sequences.data.map(s => s.map(p => labelPoints[p]));
    }
    return (<RawSequences>loaded).data;
  }
  
  private loadMSA(file = this.tlo.filebase+'-msa.json', fasta?: boolean): string[][] {
    if (fasta) {
      const fasta = loadTextFile(file.replace('json','fa')).split(">").slice(1)
        .map(f => f.split("\n").slice(1).join(''));
      return fasta.map(f => f.split('').map((c,i) => c === '-' ? "" : "M"+i));
    } else {
      let json = loadJsonFile(file);
      return json["msa"] ? json["msa"] : json;
    }
  }
  
  async getStructure(timeline: GraphPartition<SegmentNode>) {
    return inferStructureFromTimeline(timeline);
  }
  
  async getPartitionRating() {
    const matrix: number[][] = loadJsonFile(this.tlo.filebase+'-matrix.json');
    const partitionSizes = loadJsonFile(this.tlo.filebase+'-output.json')
      ["segments"].map((s: any[]) => s.length);
    return getSequenceRatingFromMatrix(matrix, partitionSizes);
  }

  async getRatingsFromMSAResult(msaFile: string) {
    return getSequenceRatingWithFactors(await this.getPartitionFromMSAResult(msaFile));
  }
  
  async getPartitionFromMSAResult(msaFile: string) {
    const points = await this.getPoints();
    const alignments = await this.getAlignments();
    const graph = await this.getAlignmentGraph();
    const msa = this.loadMSA(msaFile);
    //const matrixBase = this.tlo.filebase+'/'+msaFile.split('/').slice(-1)[0].replace('.json','');
    return getTimelineFromMSA(msa, points,
      alignments.versionTuples, alignments.alignments, graph);
  }
  
  async getTimelineFromMSAResult(msaFile: string, minSegSizeProp = 0.1) {
    let timeline = await this.getPartitionFromMSAResult(msaFile);
    const maxPartSize = timeline.getMaxPartitionSize();
    timeline.removeSmallPartitions(minSegSizeProp*maxPartSize);
    return timeline;
  }

  async getTimelineModeLabels(msaFile: string, minSegSizeProp = 0.1) {
    return (await this.getTimelineFromMSAResult(msaFile, minSegSizeProp))
      .getPartitions()
      .map(t => pcSetToLabel(getMode(t.map(n => n.point.slice(1)))));
  }
  
  async getTimelineSectionModeLabels(msaFile: string, numConns: number,
      minSegSizeProp = 0.1, maskThreshold = 0.2) {
    const timeline = await this.getTimelineFromMSAResult(msaFile, minSegSizeProp);
    const sections = getSectionGroupsFromTimelineMatrix(timeline.getConnectionMatrix(), numConns,
      //'results/msa-sweep-beats-test/china_doll100g0mb/conn-matrix.json',
      undefined, maskThreshold);
    const tlParts = timeline.getPartitions();
    const sectionTypeLabels = sections.map(s => _.zip(...s).map(is =>
      pcSetToLabel(getMode(_.flatten(is.map(i => tlParts[i].map(t => t.point.slice(1))))))));
    //console.log(JSON.stringify(sectionTypeLabels))
    const timelineLabels = tlParts.map(t =>
      pcSetToLabel(getMode(t.map(n => n.point.slice(1)))));
    //console.log(JSON.stringify(timelineLabels))
    sections.forEach((type,i) => type.forEach(sec =>
      sec.forEach((seg,j) => timelineLabels[seg] = sectionTypeLabels[i][j])));
    //console.log(JSON.stringify(timelineLabels))
    return timelineLabels;
  }

  async saveMultiTimelineDecomposition() {
    //if (!fs.existsSync(tlo.filebase+'-output.json')) {
      const alignments = await this.getAlignments();
      const timeline = getTimelineFromAlignments(alignments.versionTuples,
        alignments.alignments);
      await this.saveOutput(timeline, alignments.versions);
      await this.saveTimelineVisuals(timeline, alignments.versions);
    //}
  }

  private async getAlignments() {
    if (!this.alignments) this.alignments = this.extractAlignments();
    return this.alignments;
  }
  
  private async getAlignmentGraph() {
    if (!this.alignmentGraph) {
      const alignments = await this.getAlignments();
      this.alignmentGraph = createSegmentGraphFromAlignments(
        alignments.versionTuples, alignments.alignments, false);
    }
    return this.alignmentGraph;
  }
  
  private async extractAlignments() {
    let tuples = <[number,number][]>_.flatten(_.range(this.tlo.count)
      .map(c => this.getMultiConfig(2, c, this.tlo.maxVersions)
      .map(pair => pair.map(s => this.tlo.audioFiles.indexOf(s)))));
    if (this.tlo.algorithm === AlignmentAlgorithm.BOTH) tuples = _.concat(tuples, tuples);
    const multis: MultiStructureResult[] = [];
    if (_.includes([AlignmentAlgorithm.SIA, AlignmentAlgorithm.BOTH], this.tlo.algorithm)) {
      multis.push(..._.flatten(await this.getMultiCosiatecsForSong(this.tlo.count, this.tlo.maxVersions)));
    }
    if (_.includes([AlignmentAlgorithm.SW, AlignmentAlgorithm.BOTH], this.tlo.algorithm)) {
      multis.push(..._.flatten(await this.getMultiSWs(this.tlo.count, this.tlo.maxVersions)));
    }
    if (this.tlo.includeSelfAlignments) {
      if (_.includes([AlignmentAlgorithm.SIA, AlignmentAlgorithm.BOTH], this.tlo.algorithm)) {
        const autos = await this.getCosiatecFromAudio();
        multis.push(...autos.map(a => Object.assign(a, {points2: a.points})));
        tuples.push(...<[number,number][]>this.tlo.audioFiles.map((_,i) => [i,i]));
      }
      if (_.includes([AlignmentAlgorithm.SW, AlignmentAlgorithm.BOTH], this.tlo.algorithm)) {
        const autos = await this.getSmithWatermanFromAudio();
        multis.push(...autos.map(a => Object.assign(a, {points2: a.points})));
        tuples.push(...<[number,number][]>this.tlo.audioFiles.map((_,i) => [i,i]));
      }
    }
    return {versionTuples: tuples, alignments: multis,
      versions: this.tlo.audioFiles, versionPoints: await this.getPoints()};
  }
  
  //segments by version
  private async getSegments(): Promise<Segment[][]> {
    const points = await this.getPoints();
    return points.map((v,i) => v.map((_p,j) =>
      ({start: points[i][j][0][0],
        duration: points[i][j+1] ? points[i][j+1][0][0]-points[i][j][0][0] : 1})));
  }
  
  private async saveOutput(timeline: GraphPartition<SegmentNode>,
      versions: string[]) {
    const segments = await this.getSegments();
    const short = versions.map(v =>
      v.split('/').slice(-2).join('/').replace(this.tlo.extension || '.m4a', '.mp3'));
    const tunings = short.map(v =>
      getThomasTuningRatio(v.split('/')[0], v.split('/')[1].replace('.mp3','')));
    const partitions = timeline.getPartitions();
    const matrix = timeline.getConnectionMatrix();
    const json = {title: _.startCase(this.tlo.collectionName), versions: short, tunings: tunings,
      segments: segments, timeline: partitions, matrix: matrix};
    saveJsonFile(this.tlo.filebase+'-output.json', json);
  }
  
  private async saveTimelineVisuals(timeline: GraphPartition<SegmentNode>,
      versions: string[]) {
    const points = await this.getPoints();
    const segments = await this.getSegments();
    const segmentsByType = inferStructureFromTimeline(timeline);
    const visuals = _.flatten(points.map((v,i) =>
      v.map((_p,t) => {
        const type = segmentsByType.findIndex(s =>
          s.find(n => n.version === i && n.time === t) != null);
        if (type >= 0) {
          const n = segmentsByType[type].find(n => n.version === i && n.time === t);
          return ({version:i, time:t, type:type+1, point:n.point, path: versions[i],
            start: segments[i][n.time].start, duration: segments[i][n.time].duration});
        }
      }))).filter(p=>p);
    saveJsonFile(this.tlo.filebase+'-visuals.json', visuals);
  }
  
  async analyzeTimeline(timeline: GraphPartition<SegmentNode>) {
    const segmentsByType = inferStructureFromTimeline(timeline);
    const points = await this.getPoints();
    const segments = points.map((v,i) => v.map((_p,j) =>
      ({start: points[i][j][0][0],
        duration: points[i][j+1] ? points[i][j+1][0][0]-points[i][j][0][0] : 1})));
    const visuals: VisualsPoint[] = _.flatten(points.map((v,i) =>
      v.map((_p,t) => {
        const type = segmentsByType.findIndex(s =>
          s.find(n => n.version === i && n.time === t) != null);
        if (type >= 0) {
          const n = segmentsByType[type].find(n => n.version === i && n.time === t);
          return ({version:i, time:t, type:type+1, point:n.point, path: this.tlo.audioFiles[i],
            start: segments[i][n.time].start, duration: segments[i][n.time].duration});
        }
      }))).filter(p=>p);
    saveJsonFile(this.tlo.filebase+'-visuals-types.json', visuals);
  }

  async saveMultiSWPatternGraph(filebase: string, count = 1) {
    const MIN_OCCURRENCE = 1;
    const multis = await this.getMultiSWs(count);
    multis.map((h,i) =>
      createSimilarityPatternGraph(h, false, filebase+'-multi'+i+'-graph.json', MIN_OCCURRENCE));
  }

  private async getMultiSWs(count: number, maxVersions?: number) {
    return mapSeries(_.range(count), async i => {
      console.log('working on ' + this.tlo.collectionName + ' - multi ' + i);
      return this.getMultiSW(i, maxVersions);
    });
  }

  private async getMultiCosiatecsForSong(count: number, maxVersions?: number) {
    return mapSeries(_.range(count), async i => {
      console.log('working on ' + this.tlo.collectionName + ' - multi ' + i);
      return this.getMultiCosiatecs(2, i, maxVersions);
    })
  }

  async saveMultiPatternGraphs(filebase: string, size = 2, count = 1) {
    const MIN_OCCURRENCE = 2;
    await mapSeries(_.range(count), async i => {
      console.log('working on ' + this.tlo.collectionName + ' - multi ' + i);
      const results = await this.getMultiCosiatecs(size, i);
      createSimilarityPatternGraph(results, false, filebase+'-multi'+size+'-'+i+'-graph.json', MIN_OCCURRENCE);
    })
  }

  async analyzeMultiPatternGraphs(filebase: string, size = 2, count = 1) {
    const graphs = _.range(count)
      .map(i =>loadGraph<PatternNode>(filebase+'-multi'+size+'-'+i+'-graph.json'));
    const grouping: NodeGroupingOptions<PatternNode> = { maxDistance: 3, condition: n => n.size > 5 };
    graphs.forEach(g => {getPatternGroupNFs(g, grouping, 5); console.log()});
  }

  async savePS(filebase: string, cosiatecFile: string, graphFile: string) {
    const file = filebase+"-seqs.json";
    const results: StructureResult[] = loadJsonFile(cosiatecFile);
    const points = results.map(r => r.points);

    const MIN_OCCURRENCE = 2;
    const PATTERN_TYPES = 10;

    const grouping: NodeGroupingOptions<PatternNode> = { maxDistance: 5, condition: (n,_c) => n.size > 5};
    const patsec = _.flatten(await this.getPatternSequences([], points, results, grouping, PATTERN_TYPES, MIN_OCCURRENCE, graphFile));

    //TODO TAKE MOST CONNECTED ONES :)

    saveJsonFile(file, patsec);
  }

  async saveSWPatternAndVectorSequences(filebase: string, _tryHalftime = false, _extension?: string) {
    const file = filebase+"-seqs.json";
    const graphFile = filebase+"-graph.json";
    console.log("\n"+this.tlo.collectionName+" "+this.tlo.audioFiles.length+"\n")

    const results = await this.getSmithWatermanFromAudio();

    const MIN_OCCURRENCE = 2;
    const PATTERN_TYPES = 20;

    /*if (tryHalftime) {
      const doubleOptions = getSwOptions(true);
      const doublePoints = await getPointsForAudioFiles(versions, doubleOptions);
      const doubleResults = await getSmithWatermanFromAudio(versions, doubleOptions);

      const graph = createSimilarityPatternGraph(results.concat(doubleResults), false, null, MIN_OCCURRENCE);
      let conn = getConnectednessByVersion(graph);
      //console.log(conn)
      //conn = conn.map((c,v) => c / points.concat(doublePoints)[v].length);
      //console.log(conn)
      versions.forEach((_,i) => {
        if (conn[i+versions.length] > conn[i]) {
          console.log("version", i, "is better analyzed doubletime");
          points[i] = doublePoints[i];
          results[i] = doubleResults[i];
        }
      })
    }*/

    /*const vecsec = _.flatten(await getVectorSequences(versions, points, options, PATTERN_TYPES));
    vecsec.forEach(s => s.version = s.version*2+1);*/

    const grouping: NodeGroupingOptions<PatternNode> = { maxDistance: 4, condition: (n,_c) => n.size > 6};
    const patsec = _.flatten(await this.getPatternSequences(this.tlo.audioFiles,
      await this.getPoints(), results, grouping, PATTERN_TYPES, MIN_OCCURRENCE, graphFile));
    //patsec.forEach(s => s.version = s.version*2);

    //TODO TAKE MOST CONNECTED ONES :)

    saveJsonFile(file, patsec)//_.union(vecsec, patsec)));
  }

  async savePatternAndVectorSequences(filebase: string, tryDoubletime = false) {
    const file = filebase+"-seqs.json";
    const graphFile = filebase+"-graph.json";
    console.log("\n"+this.tlo.collectionName+" "+this.tlo.audioFiles.length+"\n")

    const points = await this.getPoints();
    const results = await this.getCosiatecFromAudio();
    results.forEach(r => this.removeNonParallelOccurrences(r));

    const MIN_OCCURRENCE = 2;
    const PATTERN_TYPES = 20;

    if (tryDoubletime) {
      const doubleOptions = Object.assign(_.clone(this.siaOptions), {doubletime: true});
      const doublePoints = await this.getPoints(doubleOptions);
      const doubleResults = await this.getCosiatecFromAudio(doublePoints);
      doubleResults.forEach(r => this.removeNonParallelOccurrences(r));

      const graph = createSimilarityPatternGraph(results.concat(doubleResults), false, null, MIN_OCCURRENCE);
      let conn = getConnectednessByVersion(graph);
      //console.log(conn)
      //conn = conn.map((c,v) => c / points.concat(doublePoints)[v].length);
      //console.log(conn)
      this.tlo.audioFiles.forEach((_,i) => {
        if (conn[i+this.tlo.audioFiles.length] > conn[i]) {
          console.log("version", i, "is better analyzed doubletime");
          points[i] = doublePoints[i];
          results[i] = doubleResults[i];
        }
      });
    }

    /*const vecsec = _.flatten(await getVectorSequences(versions, points, options, PATTERN_TYPES));
    vecsec.forEach(s => s.version = s.version*2+1);*/

    const grouping: NodeGroupingOptions<PatternNode> = { maxDistance: 4, condition: (n,_c) => n.size > 6};
    const patsec = _.flatten(await this.getPatternSequences(this.tlo.audioFiles, points, results, grouping, PATTERN_TYPES, MIN_OCCURRENCE, graphFile));
    //patsec.forEach(s => s.version = s.version*2);

    //TODO TAKE MOST CONNECTED ONES :)

    saveJsonFile(file, patsec)//_.union(vecsec, patsec)));
  }

  async savePatternSequences(file: string) {//, hubSize: number, appendix = '') {
    const results = await this.getCosiatecFromAudio();
    results.forEach(r => this.removeNonParallelOccurrences(r));
    const sequences = await this.getPatternSequences(this.tlo.audioFiles,
      await this.getPoints(), results, {maxDistance: 3}, 10);
    saveJsonFile(file, _.flatten(sequences));
    //visuals.map(v => v.join('')).slice(0, 10).forEach(v => console.log(v));
  }

  private async getPatternSequences(audio: string[], points: any[][],
      results: StructureResult[], groupingOptions: NodeGroupingOptions<PatternNode>,
      typeCount = 10, minCount = 2, path?: string): Promise<VisualsPoint[][]> {
    const sequences = results.map((v,i) => v.points.map((p,j) =>
      ({version:i, time:j, type:0, point:p, path: audio[i],
        start: points[i][j][0][0],
        duration: points[i][j+1] ? points[i][j+1][0][0]-points[i][j][0][0] : 1})));
    const nfMap = getNormalFormsMap(results);
    const graph = createSimilarityPatternGraph(results, false, path, minCount);

    const mostCommon = getPatternGroupNFs(graph, groupingOptions, typeCount);
    //mostCommon.slice(0, typeCount).forEach(p => console.log(p[0]+ " " + p.length));
    mostCommon.forEach((nfs,nfi) =>
      nfs.forEach(nf => nfMap[nf].forEach(([v, p]: [number, number]) => {
        const pattern = results[v].patterns[p];
        let indexOccs = pointsToIndices([pattern.occurrences], results[v].points)[0];
        //fill in gaps
        indexOccs = indexOccs.map(o => _.range(o[0], _.last(o)+1));
        indexOccs.forEach(o => o.forEach(i => i >= 0 ? sequences[v][i].type = nfi+1 : null));
      })
    ));
    return sequences;
  }

  private removeNonParallelOccurrences(results: StructureResult, dimIndex = 0) {
    results.patterns.forEach(p => {
      const parallel = p.vectors.map(v => v.every((d,i) => i == dimIndex || d == 0));
      p.vectors = p.vectors.filter((_,i) => parallel[i]);
      p.occurrences = p.occurrences.filter((_,i) => parallel[i]);
    })
  }

  async saveVectorSequences(file: string, typeCount?: number) {
    const sequences = await this.getVectorSequences(this.tlo.audioFiles,
      await this.getPoints(), this.siaOptions, typeCount);
    saveJsonFile(file, _.flatten(sequences));
  }

  private async getVectorSequences(audio: string[], points: any[][],
      options: FullSIAOptions, typeCount = 3): Promise<VisualsPoint[][]> {
    const quantPoints = points.map(p => this.quantize(p, options));
    const atemporalPoints = quantPoints.map(v => v.map(p => p.slice(1)));
    const pointMap = toIndexSeqMap(atemporalPoints, JSON.stringify);
    const mostCommon = getMostCommonPoints(_.flatten(atemporalPoints));
    const sequences = quantPoints.map((v,i) => v.map((p,j) =>
      ({version:i, time:j, type:0, point:p, path: audio[i],
        start: points[i][j][0][0],
        duration: points[i][j+1] ? points[i][j+1][0][0]-points[i][j][0][0] : 1})));
    mostCommon.slice(0, typeCount).forEach((p,i) =>
      pointMap[JSON.stringify(p)].forEach(([v, p]) => sequences[v][p].type = i+1));
    return sequences;
  }
  
  private quantize(points: any[][], options: FeatureOptions) {
    return new Quantizer(options.quantizerFunctions).getQuantizedPoints(points);
  }
  
  async getSmithWatermanFromAudio() {
    const points = await this.getPoints();
    return mapSeries(this.tlo.audioFiles, async (a,i) => {
      updateStatus('  ' + (i+1) + '/' + this.tlo.audioFiles.length);
      if (!this.tlo.maxPointsLength || points.length < this.tlo.maxPointsLength) {
        const sw = getSmithWaterman(points[i], getOptionsWithCaching(a, this.swOptions));
        sw.matrices = null; sw.segmentMatrix = null;
        return sw;
      }
    });
  }

  async getCosiatecFromAudio(points?: any[][][]) {
    points = points || await this.getPoints();
    return mapSeries(this.tlo.audioFiles, async (a,i) => {
      updateStatus('  ' + (i+1) + '/' + this.tlo.audioFiles.length);
      if (!this.tlo.maxPointsLength || points.length < this.tlo.maxPointsLength) {
        return getCosiatec(points[i], getOptionsWithCaching(a, this.siaOptions));
      }
    });
  }

  private async getMultiSW(index: number, count?: number) {
    const tuples = this.getMultiConfig(2, index, count);
    const points = await this.getPoints();
    return mapSeries(tuples, async (tuple,i) => {
      updateStatus('  ' + (i+1) + '/' + tuples.length);
      const currentPoints = tuple.map(a => points[this.tlo.audioFiles.indexOf(a)]);
      if (currentPoints[0] && currentPoints[1]) {
        return getDualSmithWaterman(currentPoints[0], currentPoints[1],
          getOptionsWithCaching(this.getMultiCacheDir(...tuple), this.swOptions));
      }
      return getDualSmithWaterman([], [], getOptionsWithCaching(this.getMultiCacheDir(...tuple), this.swOptions));
    });
  }

  private async getMultiCosiatecs(size: number, index: number, count?: number) {
    const points = await this.getPoints();
    const tuples = this.getMultiConfig(size, index, count);
    return mapSeries(tuples, async (tuple,i) => {
      updateStatus('  ' + (i+1) + '/' + tuples.length);
      const currentPoints = tuple.map(a => points[this.tlo.audioFiles.indexOf(a)]);
      return getMultiCosiatec(currentPoints,
        getOptionsWithCaching(this.getMultiCacheDir(...tuple), this.siaOptions));
    })
  }

  /*private async getSlicedMultiCosiatec(name: string, size: number, index: number, audioFiles: string[]) {
    const pairs = getMultiConfig(name, size, index, audioFiles);
    //TODO UPDATE PATH!!!!
    const options = getBestOptions(initDirRec(GD_PATTERNS+'/multi'+index));
    return _.flatten(await mapSeries(pairs, async (pair,i) => {
      updateStatus('  ' + (i+1) + '/' + pairs.length);
      const points = await getPointsForAudioFiles(pair, options);
      const slices = points.map(p => getSlices(p));
      const multis = _.zip(...slices).map(s => s[0].concat(s[1]));
      return multis.map(h => {
        return getInducerWithCaching(pair[0], h, options).getCosiatec();
      });
    }))
  }

  private getSlices<T>(array: T[]) {
    const start = array.slice(0, array.length/2);
    const middle = array.slice(array.length/4, 3*array.length/4);
    const end = array.slice(array.length/2);
    return [start, middle, end];
  }*/
  
  private async getPoints(featureOptions = this.tlo.featureOptions) {
    if (!this.points) this.points = new FeatureLoader(this.tlo.featuresFolder)
      .getPointsForAudioFiles(this.tlo.audioFiles, featureOptions);
    return this.points;
  }

  private getMultiCacheDir(...audio: string[]) {
    let names = audio.map(audioPathToDirName)
    //only odd chars if too long :)
    if (audio.length > 3) names = names.map(n => n.split('').filter((_,i)=>i%2==0).join(''));
    return names.join('_X_');
  }

  private getMultiConfig(size: number, index: number, count = 0): string[][] {
    const name = this.tlo.collectionName;
    const maxLength = this.tlo.maxPointsLength || 0;
    const file = this.tlo.patternsFolder+'multi-config.json';
    const config: {} = loadJsonFile(file) || {};
    if (!config[name]) config[name] = {};
    if (!config[name][size]) config[name][size] = {};
    if (!config[name][size][maxLength]) config[name][size][maxLength] = {};
    if (!config[name][size][maxLength][count]) config[name][size][maxLength][count] = [];
    if (!config[name][size][maxLength][count][index]) {
      config[name][size][maxLength][count][index] = this.getRandomTuples(this.tlo.audioFiles, size);
      if (config[name][size][maxLength][count][index].length > 0) //only write if successful
        saveJsonFile(file, config);
    }
    return config[name][size][maxLength][count][index];
  }

  private getRandomTuples<T>(array: T[], size = 2): T[][] {
    const tuples: T[][] = [];
    while (array.length >= size) {
      const tuple = _.sampleSize(array, size);
      tuples.push(tuple);
      array = _.difference(array, tuple);
    }
    return tuples;
  }
  
}