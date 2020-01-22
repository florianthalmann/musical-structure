import * as _ from 'lodash';
import { GraphPartition } from '../graphs/graph-partition';
import { SegmentNode } from './types';

//all values are exponents that control strength of parts of heuristic
interface SequenceRatingOptions {
  nodeCount?: number, //total node count
  compactness?: number, //nodes per segment
  selfconnectedness?: number, //self-connections per segment
  connectedness?: number, //mean non-empty connections
  nonEmpty?: number, //proportion of non-empty connections
  gapEntropy?: number, //entropy of distribution of gap lengths
  gapSize?: number, //measure for the size of gaps
  adjacentsMin?: number, //proportion of min connections to adjacent bins
  adjacentsMax?: number, //proportion of max connections to adjacent bins
  diagonals?: number, //proportion of lone diagonals
}

//pretty good options achieved early on
const GOOD: SequenceRatingOptions = {
  nodeCount: 0.5,
  compactness: 0.2,
  gapEntropy: -0.2,
  adjacentsMin: -0.2
}

//best found so far, using diagonals
const BEST: SequenceRatingOptions = {
  nodeCount: 0.5,
  compactness: 0.1,
  gapEntropy: -0.7,
  adjacentsMin: -0.7,
  diagonals: 0.3
}

const quantity = 1;
const quality = 1;
const TEST: SequenceRatingOptions = {
  nodeCount: quantity,
  compactness: 0.1*quantity,
  //connectedness: 0.3,
  gapEntropy: -0.7*quality,
  adjacentsMin: -0.7*quality,
  diagonals: quality
}

const options = TEST;

//assumes that the sequence is a valid one (no double occs, no double versions, lin ordered)
export function getSequenceRating(sequence: GraphPartition<SegmentNode>) {
  const factors: number[] = [];
  
  const numNodes = sequence.getNodeCount();
  const connectionMatrix = sequence.getConnectionMatrix();
  const bins = _.flatten(connectionMatrix);
  const totalConnections = _.sum(bins);
  const nonEmptyBins = bins.filter(b => b > 0);
  const horizontalGaps = getHorizontalGapSizes(bins);
  
  if (options.nodeCount) {
    factors.push(Math.pow(numNodes, options.nodeCount));
  }
  
  if (options.compactness) {
    const numSegs = sequence.getPartitionCount();
    const compactness = numNodes / numSegs;//Math.pow(numSegs+1, 0.8);
    factors.push(Math.pow(compactness, options.compactness));
  }
  
  if (options.selfconnectedness) {
    const connectedness = _.mean(getMainDiagonal(connectionMatrix));
    factors.push(Math.pow(connectedness, options.selfconnectedness));
  }
  
  if (options.connectedness) {
    const connectedness = _.mean(nonEmptyBins);
    factors.push(Math.pow(connectedness, options.connectedness));
  }
  
  if (options.nonEmpty) {
    const nonEmptyProp = nonEmptyBins.length/bins.length;
    factors.push(Math.pow(nonEmptyProp, options.nonEmpty));
  }
  
  if (options.gapEntropy) {
    const gapHistogram = toHistogram(horizontalGaps);
    const gapEntropy = getEntropy(toDistribution(gapHistogram.slice(1)));
    factors.push(Math.pow(gapEntropy+1, options.gapEntropy));
  }
  
  if (options.gapSize) {
    const meanGap = _.mean(horizontalGaps); //getMedian(horizontalGaps);
    const maxGap = _.max(horizontalGaps);
    factors.push(Math.pow(meanGap/maxGap, options.gapSize));
  }
    
  if (options.adjacentsMin) {
    const adjacentsMin = getAdjacentsMin(bins, totalConnections);
    factors.push(Math.pow(adjacentsMin+1, options.adjacentsMin));
  }
  
  if (options.adjacentsMax) {
    const adjacentsMax = getAdjacentsMax(bins, totalConnections);
    factors.push(Math.pow(adjacentsMax+1, options.adjacentsMax));
  } 
  
  if (options.diagonals) {
    const diagonals = getNumLoneDiagonals(connectionMatrix)
      / (nonEmptyBins.length+1) //Math.pow(1+nonEmptyBins.length, 0.8);
    factors.push(Math.pow(diagonals+1, options.diagonals));
  }
  
  return _.reduce(factors, _.multiply) || 0; //0 if NaN...
}

function getHorizontalGapSizes(bins: number[]) {
  const hIndexes = bins.map((v,i) => v ? i : null).filter(i => i);
  return hIndexes.map((v,i) => i > 0 ? v-hIndexes[i-1] : 0).slice(1);
}

function getNumLoneDiagonals(connections: number[][]) {
  return _.flatten(connections.map((r,i) =>
      r.map((v,j) => i > 0 && j > 0 && v > 0 && connections[i-1][j-1] > 0
      && r[i-1] == 0 && r[i+1] == 0))) //empty bins on both sides
    .filter(v => v).length;
}

function getAdjacentsMax(bins: number[], totalConnections: number) {
  const adjMax = _.sum(bins.map((v,i) =>
    i > 0 && v > 0 && bins[i-1] > 0 ? Math.max(v, bins[i-1]) : 0));
  return adjMax / totalConnections;
}

function getAdjacentsMin(bins: number[], totalConnections: number) {
  const adjMin = _.sum(bins.map((v,i) =>
    i > 0 && v > 0 && bins[i-1] > 0 ? Math.min(v, bins[i-1]) : 0));
  return adjMin / totalConnections;
}

function toHistogram(vals: number[]) {
  const grouped = _.groupBy(vals);
  return _.range(_.min(vals), _.max(vals)+1)
    .map(v => grouped[v] ? grouped[v].length : 0);
}

function toDistribution(histo: number[]) {
  const total = _.sum(histo);
  return histo.map(h => h/total);
}

function getEntropy(data: number[]) {
  return -1 * _.sum(data.map(d => d ? d*Math.log(d) : 0));
}

function getMedian(data: number[]) {
  return _.sortBy(data)[_.round(data.length/2)];
}

function getMainDiagonal(matrix: number[][]) {
  return matrix.map((r,i) => r.filter((_v,j) => i == j));
}