import json
import numpy as np
from profile_hmm import ProfileHMM

path = "results/timeline-test7/meandmyuncle30-points.json"

with open(path) as ofile:
    loaded = json.load(ofile)
    lengths = [len(d) for d in loaded["data"]]
    data = np.concatenate([[[v] for v in d] for d in loaded["data"]])
    labels = loaded["labels"]

length = int(round(np.mean(lengths)))
print('length', length)
model = ProfileHMM(6, 24)
model = model.fit(data, lengths)
score = model.score(data, lengths)
print(score)
print(model.startprob_)
print(model.transmat_)
print(model.emissionprob_)
print(model.predict(data, lengths))