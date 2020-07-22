import * as fs from 'fs';
import * as _ from 'lodash';
import { pointsToIndices, StructureResult, MultiStructureResult,
  getSelfSimilarityMatrix, Quantizer } from 'siafun';
import { mapSeries } from '../files/util';
import { loadJsonFile, saveJsonFile, saveTextFile, loadTextFile } from '../files/file-manager';
import { NodeGroupingOptions } from '../graphs/graph-analysis';
import { loadGraph, DirectedGraph } from '../graphs/graph-theory';
import { GraphPartition } from '../graphs/graph-partition';
import { getSiaOptions, getSwOptions, FullSIAOptions, FullSWOptions,
  FeatureOptions } from '../files/options';
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
import { AlignmentAlgorithm, Alignments, AlignmentOptions, extractAlignments, getMultiSWs,
  getMultiCosiatecs, getSmithWatermanFromAudio, getCosiatecFromAudio } from './alignments';

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
  private alignments: Alignments;
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
      await this.saveTimelineVisuals(timeline);
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
      await this.saveTimelineVisuals(timeline);
    //}
  }

  private async getAlignments() {
    if (!this.alignments)
      this.alignments = extractAlignments(await this.getAlignmentOptions());
    return this.alignments;
  }
  
  private async getAlignmentOptions(numTuplesPerFile?: number, tupleSize?: number): Promise<AlignmentOptions> {
    return Object.apply(this.tlo, {
      points: await this.getPoints(),
      swOptions: this.swOptions,
      siaOptions: this.siaOptions,
      numTuplesPerFile: numTuplesPerFile,
      tupleSize: tupleSize
    });
  }
  
  private async getAlignmentGraph() {
    if (!this.alignmentGraph) {
      const alignments = await this.getAlignments();
      this.alignmentGraph = createSegmentGraphFromAlignments(
        alignments.versionTuples, alignments.alignments, false);
    }
    return this.alignmentGraph;
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
  
  async saveTimelineVisuals(timeline: GraphPartition<SegmentNode>, path?: string) {
    const points = await this.getPoints();
    const segments = await this.getSegments();
    const segmentsByType = inferStructureFromTimeline(timeline);
    const alignments = await this.getAlignments();
    const visuals = _.flatten(points.map((v,i) =>
      v.map((_p,t) => {
        const type = segmentsByType.findIndex(s =>
          s.find(n => n.version === i && n.time === t) != null);
        if (type >= 0) {
          const n = segmentsByType[type].find(n => n.version === i && n.time === t);
          return ({version:i, time:t, type:type+1, point:n.point, path: alignments.versions[i],
            start: segments[i][n.time].start, duration: segments[i][n.time].duration});
        }
      }))).filter(p=>p);
    saveJsonFile(path || this.tlo.filebase+'-visuals.json', visuals);
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
    const multis = await getMultiSWs(await this.getAlignmentOptions(count));
    multis.map((h,i) =>
      createSimilarityPatternGraph(h, false, filebase+'-multi'+i+'-graph.json', MIN_OCCURRENCE));
  }

  async saveMultiPatternGraphs(filebase: string, size = 2, count = 1) {
    const MIN_OCCURRENCE = 2;
    await mapSeries(_.range(count), async i => {
      console.log('working on ' + this.tlo.collectionName + ' - multi ' + i);
      const results = await getMultiCosiatecs(i, await this.getAlignmentOptions(count, size));
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

    const results = getSmithWatermanFromAudio(await this.getAlignmentOptions());

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
    const results = getCosiatecFromAudio(await this.getAlignmentOptions());
    results.forEach(r => this.removeNonParallelOccurrences(r));

    const MIN_OCCURRENCE = 2;
    const PATTERN_TYPES = 20;

    if (tryDoubletime) {
      const doubleOptions = Object.assign(_.clone(this.siaOptions), {doubletime: true});
      const doublePoints = await this.getPoints(doubleOptions);
      const doubleAO = await this.getAlignmentOptions();
      doubleAO.points = doublePoints;
      const doubleResults = await getCosiatecFromAudio(doubleAO);
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
    const results = await getCosiatecFromAudio(await this.getAlignmentOptions());
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
  
  private async getPoints(featureOptions = this.tlo.featureOptions) {
    if (!this.points) this.points = new FeatureLoader(this.tlo.featuresFolder)
      .getPointsForAudioFiles(this.tlo.audioFiles, featureOptions);
    return this.points;
  }
  
}