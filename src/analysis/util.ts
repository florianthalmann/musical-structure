import * as _ from 'lodash';
import { allIndexesWith } from '../graphs/util';

export function allIndexesOf<T>(array: T[], value: T) {
  return allIndexesWith(array, a => a === value);
}

export function getCompletedNumberArray2(nums: number[]) {
  nums = _.clone(nums);
  while (nums.findIndex(n => n == null) >= 0) {
    const nextNullStart = nums.findIndex(n => n == null);
    let nextNullEnd = nums.slice(nextNullStart).findIndex(n => n != null);
    nextNullEnd = nextNullEnd >= 0 ? nextNullStart+nextNullEnd : nums.length;
    const length = nextNullEnd - nextNullStart;
    const low = nums[nextNullStart-1] != null ? nums[nextNullStart-1] : 0;
    const high = nextNullEnd && nums[nextNullEnd] ?
      nums[nextNullEnd] : low+length;
    _.range(nextNullStart, nextNullEnd)
      .forEach((n,i) => nums[n] = low+((i+1)*((high-low)/(length+1))));
  }
  return nums;
}

//no longer used...
export function getCompletedNumberArray(nums: number[]) {
  nums = _.clone(nums);
  //fill gaps and end
  nums.forEach((n,i) => {
    if (n == null && nums[i-1] != null) {
      const next = nums.slice(i).find(t => t != null);
      nums[i] = next ? Math.min(nums[i-1]+1, next) : nums[i-1]+1;
    }
  });
  //fill beginning
  nums = _.reverse(nums);
  nums.forEach((n,i) => nums[i] = n != null ? n : Math.max(nums[i-1]-1, 0));
  return _.reverse(nums);
}

export function toDistribution(histo: number[]) {
  const total = _.sum(histo);
  return histo.map(h => h/total);
}

export function toHistogram(vals: number[]) {
  const grouped = _.groupBy(vals);
  return _.range(_.min(vals), _.max(vals)+1)
    .map(v => grouped[v] ? grouped[v].length : 0);
}

export function getEntropy(data: number[]) {
  return -1 * _.sum(data.map(d => d ? d*Math.log(d) : 0));
}

export function getMedian(data: number[]) {
  return _.sortBy(data)[_.round(data.length/2)];
}

export function getStandardDeviation(data: number[]) {
  const mean = _.mean(data);
  return Math.sqrt(_.sum(data.map(d => Math.pow(d-mean, 2))) / (data.length-1));
}

export function getMode(data: any[]) {
  const occs = _.sortBy(_.toPairs(_.groupBy(data, d => JSON.stringify(d))), 1);
  return occs.length ? JSON.parse(_.last(occs)[0]) : null;
}