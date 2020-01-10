import * as _ from 'lodash';

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