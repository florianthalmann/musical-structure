import * as _ from 'lodash';
import { loadJsonFile } from './file-manager';
import { parseTriad } from './theory';
import { cartesianProduct } from './util';

interface SheetWithRefs {
  _form: string[],
  [section: string]: string | string[] | string[][]
}

interface FlatSheet {
  _form: string[],
  [section: string]: string[]
}

export function generateAllPossibleChordSeqs(path: string, maxLength: number) {
  const sheet = parseLeadSheet(path);
  const sections = _.keys(sheet).filter(s => s != "_form").map(s => sheet[s]);
  //cartesianProduct
}

export function getStandardChordSequence(path: string, triads: boolean) {
  const sheet = parseLeadSheet(path);
  const chords = _.flatten(sheet._form.map(s => sheet[s.replace(/\./g, '')]));
  console.log(JSON.stringify(chords))
  return triads ? chords.map(v => parseTriad(v)) : chords;
}

function parseLeadSheet(path: string): FlatSheet {
  const sheet: SheetWithRefs = loadJsonFile(path);
  const sections = _.keys(sheet).filter(s => s != "_form");
  //resolve all sections defined by reference
  return <FlatSheet>_.mapValues(sheet, (s, n) => {
    if (n == '_form') return s;
    let section: string[] = Array.isArray(s) ? _.flatten(s) : [s];
    while (_.intersection(section, sections).length > 0) {
      section = _.flatten(section.map(c =>
        Array.isArray(sheet[c.replace(/\./g, '')]) ?
          _.flatten(sheet[c.replace(/\./g, '')]) : c));
    }
    return section;
  });
}