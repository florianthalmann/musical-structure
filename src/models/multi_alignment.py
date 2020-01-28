import json, operator
import numpy as np
from profile_hmm import ProfileHMM

path = "results/timeline-test7/meandmyuncle30-points.json"

with open(path) as ofile:
    loaded = json.load(ofile)
    lengths = [len(d) for d in loaded["data"]]
    data = loaded["data"]
    labels = loaded["labels"]

median_length = int(np.median(lengths))
init_sequence = [d for d in data if len(d) == median_length][0]
print('length', median_length, len(init_sequence))
data = np.array(np.delete(data, data.index(init_sequence), 0))

#print(''.join(str(s) for s in init_sequence))
for sequence in map(list, data[:10]):
    print(''.join(str(s) for s in sequence))


model = ProfileHMM(median_length, 24, init_sequence)
model = model.fit(data)
# logp, path = model.viterbi(data[0])
# print(data[0])
# print(logp, [s.name for idx, s in path])

def get_dist_max(dist):
    return max(dist.parameters[0], key=dist.parameters[0].get)

for sequence in data[:10]:
    logp, path = model.viterbi(sequence)
    idx, state = path[0]
    print(''.join( '-' if state.name[0] == 'I'
        else str(get_dist_max(state.distribution)) if state.name[0] == 'M'
        else state.name[0]
        for idx, state in path[1:-1]))
