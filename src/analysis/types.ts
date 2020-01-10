import { Node } from '../graphs/graph-theory';
import { GroupingCondition } from '../graphs/graph-analysis';

export interface SegmentNode extends Node {
  point: number[],
  version: number,
  time: number
}

export interface SequenceValidityOptions {
  connected?: boolean, //all nodes connected to at least one other one
  component?: boolean, //each segment a single component
  affinity?: boolean, //all nodes in segment to which they are most connected
  versions?: boolean //ensure all slices include only one node per version
  uniqueness?: boolean, //every node appears only once
  order?: boolean, //segments are strictly ordered in time
  minSizeFactor?: number
}

export interface SequenceImprovementOptions {
  merge?: boolean, //merge neighboring partitions with distinct versions
  missing?: boolean, //add any missing segments at best spots
  missingIgnore?: boolean,
  blurs?: boolean, //remove all nodes with connections to neighboring slices
  cycles?: boolean,
  minSizeFactor?: number
}

export interface SeqConstImprovementOptions {
  merge?: boolean,
  slide?: boolean,
  swap?: boolean
}

export interface AddSegmentsOptions {
  graphAdjacentsSearch?: boolean, //graph search algorithm that finds adjacent well-rated segments
  graphBestRatedSearch?: boolean, //graph search algorithm that finds disjunct best-rated segments
  groupingCondition?: GroupingCondition<SegmentNode> //for graph search
  indexNeighborSearch?: boolean, //quick and efficient search algorithm that finds neighbors of existing segments
  minSizeFactor?: number,
  maxNumSegments?: number
}