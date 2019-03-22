import * as math from 'mathjs';
import * as _ from 'lodash';
import { SuperDymoStore, uris } from 'dymo-core';
import { StructureInducer, IterativeSmithWatermanResult, Similarity, Quantizer, SmithWaterman, Hierarchizer, Segmentation } from 'siafun'
import { mapSeries, printPatterns, printPatternSegments } from './util';

export class DymoStructureInducer {
  
  constructor(private store: SuperDymoStore) {}

  async flattenStructure(dymoUri: string) {
    let leaves = this.recursiveFlatten(dymoUri);
    await this.store.setParts(dymoUri, leaves);
  }

  private async recursiveFlatten(dymoUri: string, parentUri?: string) {
    let parts = await this.getAllParts([dymoUri]);
    if (parts.length > 0) {
      if (parentUri) {
        await this.store.removeDymo(dymoUri);
      }
      return _.uniq(_.flatten(parts.map(p => this.recursiveFlatten(p, dymoUri))));
    } else {
      return dymoUri;
    }
  }

  //adds a hierarchical structure to the subdymos of the given dymo in the given store
  async addStructureToDymo(dymoUri, options) {
    var surfaceDymos = await this.getAllParts([dymoUri]);
    var points = await this.toVectors(surfaceDymos, false, true);
    var patterns = new StructureInducer(points, options).getCosiatecIndexOccurrences().occurrences;
    patterns = patterns.filter(p => p[0].length > 1);
    printPatterns(_.cloneDeep(patterns));
    printPatternSegments(_.cloneDeep(patterns));
    const hierarchy = new Hierarchizer().inferHierarchyFromPatterns(patterns);
    //console.log(JSON.stringify(patterns));
    await this.createStructure(patterns, dymoUri, surfaceDymos);
  }

  private async createStructure(occurrences: number[][][], dymoUri, surfaceDymos) {
    var patternDymos = [];
    await mapSeries(occurrences, async (os,i) => {
      var currentPatternDymo = await this.store.addDymo((uris.CONTEXT_URI+"pattern"+i), dymoUri);
      patternDymos.push(currentPatternDymo);
      var dymoUris = os.map(o => o.map(index => surfaceDymos[index]));
      var features = await this.store.findAllObjects(dymoUris[0][0], uris.HAS_FEATURE)
      features = await Promise.all(features.map(f => this.store.findObject(f, uris.TYPE)));
      var occDymos = [];
      await mapSeries(dymoUris, async (ds,j) => {
        var currentOccDymo = await this.store.addDymo((uris.CONTEXT_URI+"occurrence"+i)+j, currentPatternDymo);
        occDymos.push(currentOccDymo);
        //console.log(dymoUris[j], occurrences[j])
        await Promise.all(ds.map(d => this.store.addPart(currentOccDymo, d)));
        await this.updateAverageFeatures(currentOccDymo, dymoUris[j], features);
      });
      await this.updateAverageFeatures(currentPatternDymo, occDymos, features);
    })
    await this.store.setParts(dymoUri, patternDymos);
    var freeSurfaceDymos = _.intersection(await this.store.findTopDymos(), surfaceDymos);
    await Promise.all(freeSurfaceDymos.map(d => this.store.addPart(dymoUri, d)));
  }

  async addStructureToDymo2(dymoUri, options) {
    var surfaceDymos = await this.getAllParts([dymoUri]);
    var points = await this.toVectors(surfaceDymos, false, true);
    var structure = new StructureInducer(points, options).getStructure();

    await this.store.removeParts(dymoUri);
    var features = await this.store.findAllObjects(surfaceDymos[0], uris.HAS_FEATURE)
    features = await Promise.all(features.map(f => this.store.findObject(f, uris.TYPE)));
    await this.recursiveCreateDymoStructure(structure, [], dymoUri, surfaceDymos, features);
  }

  async testSmithWaterman(dymoUri, options): Promise<IterativeSmithWatermanResult> {
    //this.flattenStructure(dymoUri, store);
    var surfaceDymos = await this.getAllParts([dymoUri]);
    var points = await this.toVectors(surfaceDymos, false, true);
    //TODO ADD SORTING DIM TO OPTIONS!!!
    let zipped = _.zip(surfaceDymos, points);
    zipped.sort((a,b) => a[1][2]-b[1][2]);
    [surfaceDymos, points] = <[string[], number[][]]>_.unzip(zipped);
    //console.log(JSON.stringify(new StructureInducer(points, options).getSmithWaterman()));
    let result = new StructureInducer(points, options).getSmithWatermanOccurrences(options);
    await this.createStructure(result.segments, dymoUri, surfaceDymos);
    return result;
  }

  async compareSmithWaterman(uri1, uri2, options) {
    var points1 = (await this.quant(uri1, options)).map(p => p.slice(0,3));
    var points2 = (await this.quant(uri2, options)).map(p => p.slice(0,3));
    new SmithWaterman(options.similarityThreshold).run(points1, points2);
  }

  private async quant(uri, options) {
    let points = await this.toVectors(await this.getAllParts([uri]), false, true);
    let quantizerFuncs = options ? options.quantizerFunctions : [];
    let quantizer = new Quantizer(quantizerFuncs);
    return quantizer.getQuantizedPoints(points);
  }

  private async recursiveCreateDymoStructure(structure, currentPath, currentParentUri, leafDymos, features) {
    for (let i = 0; i < structure.length; i++) {
      if (typeof structure[i] === 'number') {
        let leafDymo = leafDymos[structure[i]];
        await this.store.addPart(currentParentUri, leafDymo);
      } else {
        let currentSubPath = currentPath.concat(i);
        let segmentUri = await this.store.addDymo((uris.CONTEXT_URI+"segment"+currentSubPath.join('.')), currentParentUri);
        await this.recursiveCreateDymoStructure(structure[i], currentSubPath, segmentUri, leafDymos, features);
        //after the recursion call, the children are there
        let children = await this.store.findParts(segmentUri);
        await this.updateAverageFeatures(segmentUri, children, features);
      }
    }
  }

  private async updateAverageFeatures(parent: string, children: string[], features: string[]) {
    var avgFeatureVals = await Promise.all(children.map(d => Promise.all(features.map(f => this.store.findFeatureValue(d, f)))));
    //remove multidimensional features
    features = features.filter((f,i) => avgFeatureVals[0][i] != null && avgFeatureVals[0][i].constructor !== Array);
    avgFeatureVals = avgFeatureVals.map(vs => vs.filter(v => v != null && v.constructor !== Array));
    avgFeatureVals = math.mean(avgFeatureVals, 0);
    //console.log(avgFeatureVals);
    await Promise.all(avgFeatureVals.map((v,k) => this.store.setFeature(parent, features[k], v)));
  }

  //adds similarity relationships to the subdymos of the given dymo in the given store
  async addSimilaritiesTo(dymoUri, threshold) {
    var currentLevel = [dymoUri];
    while (currentLevel.length > 0) {
      if (currentLevel.length > 1) {
        var vectorMap = await this.toNormVectors(currentLevel);
        var similarities = Similarity.getCosineSimilarities(vectorMap);
        //this.addHighestSimilarities(store, similarities, currentLevel.length/2);
        Similarity.addSimilaritiesAbove(this.store, similarities, threshold);
      }
      currentLevel = await this.getAllParts(currentLevel);
    }
  }

  //adds navigatable graph based on similarity relationships to the subdymos of the given dymo in the given store
  async addSuccessionGraphTo(dymoUri, threshold) {
    var currentLevel = [dymoUri];
    while (currentLevel.length > 0) {
      if (currentLevel.length > 1) {
        //add sequential successions
        for (var i = 0; i < currentLevel.length-1; i++) {
          this.store.addSuccessor(currentLevel[i], currentLevel[i+1]);
        }
        //add successions based on similarity
        var vectorMap = await this.toNormVectors(currentLevel);
        var similarities = Similarity.getCosineSimilarities(vectorMap);
        for (var uri1 in similarities) {
          for (var uri2 in similarities[uri1]) {
            if (similarities[uri1][uri2] > threshold) {
              Similarity.addSuccessorToPredecessorOf(uri1, uri2, currentLevel, this.store);
              Similarity.addSuccessorToPredecessorOf(uri2, uri1, currentLevel, this.store);
            }
          }
        }
      }
      currentLevel = await this.getAllParts(currentLevel);
    }
  }

  async getAllParts(dymoUris: string[]): Promise<string[]> {
    return _.flatten(await Promise.all(dymoUris.map(d => this.store.findParts(d))));
  }

  /**
   * returns a map with a normalized vector for each given dymo. if reduce is true, multidimensional ones are reduced
   */
  async toNormVectors(dymoUris: string[], reduce?: boolean) {
    var vectors = await this.toVectors(dymoUris, reduce);
    vectors = new Quantizer(null).normalize(vectors);
    //pack vectors into map so they can be queried by uri
    var vectorsByUri = {};
    for (var i = 0; i < vectors.length; i++) {
      vectorsByUri[dymoUris[i]] = vectors[i];
    }
    return vectorsByUri;
  }

  /**
   * returns a map with a vector for each given dymo. if reduce is true, multidimensional ones are reduced
   */
  async toVectors(dymoUris: string[], reduce?: boolean, noFlatten?: boolean): Promise<number[][]> {
    var vectors = [];
    for (var i = 0, l = dymoUris.length; i < l; i++) {
      var currentVector = [];
      var currentFeatures = (await this.store.findAllFeatureValues(dymoUris[i]))
        .filter(v => typeof v != "string");
      for (var j = 0, m = currentFeatures.length; j < m; j++) {
        var feature = currentFeatures[j];
        //reduce all multidimensional vectors to one value
        if (reduce && feature.length > 1) {
          feature = Similarity.reduce(feature);
        }
        if (feature.length > 1) {
          if (noFlatten) {
            currentVector.push(feature);
          } else {
            currentVector = currentVector.concat(feature);
          }
        } else {
          feature = Number(feature);
          currentVector.push(feature);
        }
      }
      vectors[i] = currentVector;
    }
    return vectors;
  }

  //TODO ADD TO QUANTIZER? or other tool i guess.. its against float errors
  private getRoundedSum(a: number[], b: number[]) {
    return _.zipWith(a, b, (a,b) => _.round(a+b));
    //a.map((ai,i) => _.round(ai + b[i]), 1);
    //_.zipWith(a, b, _.flow([_.add, _.round.curryRight(1)]);
  }

}