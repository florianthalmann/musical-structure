import os, json
import numpy as np
from matplotlib import pyplot as plt

BASE = 'results/salami/'
FIRST = 955
LAST = 1498
SUBDIRS = ['johanbars/']

dirs = [os.path.join(BASE, d) for d in SUBDIRS]
files = [os.path.join(d, f) for d in dirs for f in os.listdir(d) if f.endswith('.json')]
jsons = [json.load(open(f)) for f in files]
print files

def mean_subdict_val(dict, key):
    vs = [v[key] for _, v in dict.iteritems() if v[key] is not None]
    return np.mean(vs) if len(vs) > 0 else None

def get_mean_pres_and_accs(json):
    precisions = [None]*(LAST-FIRST+1)
    accuracies = [None]*(LAST-FIRST+1)
    for track, results in json.iteritems():
        precisions[int(track)-FIRST] = mean_subdict_val(results, 'precision')
        accuracies[int(track)-FIRST] = mean_subdict_val(results, 'accuracy')
    return precisions, accuracies

pres = [get_mean_pres_and_accs(j)[0] for j in jsons]

z = zip(*pres)
z = [x for x in z if x[0] is not None]
#z.sort(key = lambda t: t[0])
pres = zip(*z)

plt.boxplot(pres)
plt.show()