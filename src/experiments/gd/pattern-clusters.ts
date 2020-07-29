import * as _ from 'lodash';
import { getTunedSongs, getBeatwiseChords } from './util';


//patrec paper

async function run() {
  const chords = await getBeatwiseChords(getTunedSongs());
}
