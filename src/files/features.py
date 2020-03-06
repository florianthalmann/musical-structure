import json, os
import numpy as np
from glob import glob

def chords_to_json(source, target):
    chords = np.argmax(np.load(source)["chord"], axis=1)
    chord_changes = np.insert(np.where(chords[:-1] != chords[1:])[0]+1, 0, 0)
    diff_chords = np.take(chords, chord_changes)
    times_and_chords = np.dstack((chord_changes*2048/44100, diff_chords))
    with open(target, 'w') as f:
        json.dump(times_and_chords.tolist()[0], f)

#chords_to_json('/Volumes/FastSSD/gd_tuned/chroma-uuid/0a2e2310-1e31-4b9a-89e5-1299023eb75c.npz')
base = '/Volumes/FastSSD/gd_tuned/chroma-uuid/'
paths = [y for x in os.walk(base) for y in glob(os.path.join(x[0], '*.npz'))]
[chords_to_json(p, p.replace('.npz','_gochords.json')) for p in paths]