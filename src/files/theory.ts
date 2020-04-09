import * as _ from 'lodash';

const MAJ = 'maj';
const MIN = 'min';

/** difference between first and second key. [-6, 6] */
export function chromaticKeyDifference(keyLabel1: string, keyLabel2: string) {
  if (keyLabel1 === keyLabel2 || parallelKeys(keyLabel1, keyLabel2)
        || relativeKeys(keyLabel1, keyLabel2))
    return 0;
  const quality1 = getChordQuality(keyLabel1);
  const quality2 = getChordQuality(keyLabel2);
  const chromDiff = chromaticDifference(keyLabel1, keyLabel2);
  if (quality1 === quality2)
    return chromDiff;
  //incorporate knowledge of relative keys
  return quality1 === MAJ ? normPitchDiff(chromDiff-3)
    : normPitchDiff(chromDiff+3);
}

export function parallelKeys(keyLabel1: string, keyLabel2: string) {
  return getPitchClass(keyLabel1) === getPitchClass(keyLabel2);
}

export function relativeKeys(keyLabel1: string, keyLabel2: string) {
  const dist = chromaticDifference(keyLabel1, keyLabel2);
  const quality1 = getChordQuality(keyLabel1);
  const quality2 = getChordQuality(keyLabel2);
  return (dist === 3 && quality1 === MAJ && quality2 === MIN)
    || (dist === -3 && quality1 === MIN && quality2 === MAJ)
}

//range [-6, 6]
export function chromaticDifference(pitchLabel1: string, pitchLabel2: string) {
  return normPitchDiff(getPitchClass(pitchLabel1) - getPitchClass(pitchLabel2));
}

//[-11, 11] => [-6, 6]
function normPitchDiff(diff: number) {
  return diff > 6 ? diff-12 : diff < -6 ? diff+12 : diff;
}

export function toPCSet(pitchSet: number[]) {
  return _.sortBy(_.uniq(pitchSet.map(p => p % 12)));
}

export function pcSetToLabel(pcset: number[]) {
  if (pcset && pcset.length) {
    const intervals = pcset.reduce<number[]>((iv,p,i) =>
      i > 0 ? _.concat(iv, p - pcset[i-1]) : iv, []);
    if (intervals[0] > 4) pcset.push(pcset.shift());
    else if (intervals[1] > 4) pcset.unshift(pcset.pop());
    const third = modForReal(pcset[1] - pcset[0], 12);
    return getPitchName(pcset[0]) + (third == 4 ? MAJ : MIN);
  }
}

function modForReal(n: number, mod: number) {
  return ((n%mod)+mod)%mod;
}

export function labelToPCSet(chordLabel: string, add7ths?: boolean) {
  const quality = getChordQuality(chordLabel);
  const rootString = quality.length > 0 ? chordLabel.split(quality)[0]
    : chordLabel.split('7')[0];
  const hasSeventh = chordLabel.indexOf('7') >= 0;
  const root = getPitchClass(rootString);
  const pcset = [root];
  pcset.push(quality === MIN ? (root+3)%12 : (root+4)%12);
  pcset.push((root+7)%12);
  if (add7ths && hasSeventh) {
    pcset.push(quality === MAJ ? (root+11)%12 : (root+10)%12);
  }
  pcset.sort((a,b)=>a-b);
  return pcset;
}

export function goIndexToPCSet(index: number): number[] {
  const root = index%12;
  const type = Math.floor(index/12);
  let pcset = type == 0 ? [root, root+4, root+7]
    : type == 1 ? [root, root+3, root+7]
    : type == 2 ? [root, root+4, root+8]
    : [root, root+3, root+6];
  pcset = pcset.map(p => p%12);
  pcset.sort((a,b)=>a-b);
  return pcset;
}

function getPitchClass(pitchOrChordLabel: string) {
  const n = pitchOrChordLabel[0];
  const name = n === 'C' ? 0 : n === 'D' ? 2 : n === 'E' ? 4 : n === 'F' ? 5
    : n === 'G' ? 7 : n === 'A' ? 9 : 11;
  return pitchOrChordLabel[1] === 'b' ? name-1 : name;
}

function getPitchName(pitchClass: number) {
  return pitchClass == 0 ? 'C' : pitchClass == 1 ? 'Db' : pitchClass == 2 ? 'D' :
    pitchClass == 3 ? 'Eb' : pitchClass == 4 ? 'E' : pitchClass == 5 ? 'F' :
    pitchClass == 6 ? 'F#' : pitchClass == 7 ? 'G' : pitchClass == 8 ? 'Ab' :
    pitchClass == 9 ? 'A' : pitchClass == 10 ? 'Bb' : 'B'
}

function getChordQuality(chordLabel: string) {
  chordLabel = _.lowerCase(chordLabel);
  return chordLabel.indexOf('min') >= 0 ? MIN
    : chordLabel.indexOf('maj') >= 0 ? MAJ
    : '';
}