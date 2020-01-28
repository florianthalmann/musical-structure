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
model = ProfileHMM(6, 24)
model = model.fit(data)
logp, path = model.viterbi(data[0])
print(data[0])
print(logp, [s.name for idx, s in path])