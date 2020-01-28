import json
import numpy as np
from profile_hmm import ProfileHMM

path = "results/timeline-test7/meandmyuncle30-points.json"

with open(path) as ofile:
    loaded = json.load(ofile)
    lengths = [len(d) for d in loaded["data"]]
    data = np.array(loaded["data"])
    labels = loaded["labels"]

length = int(round(np.mean(lengths)))
print('length', length)

for sequence in map(list, data[:5]):
    print(''.join(str(s) for s in sequence))

model = ProfileHMM(20, 24)
model = model.fit(data)
# logp, path = model.viterbi(data[0])
# print(data[0])
# print(logp, [s.name for idx, s in path])

for sequence in map(list, data[:5]):
    logp, path = model.viterbi( sequence )
    #print(str(sequence), logp)
    print(''.join( '-' if state.name[0] == 'I' else state.name[0]
        for idx, state in path[1:-1] ))

