import json
#import numpy as np
from matplotlib import pyplot as plt
from sklearn.manifold import MDS
import seaborn as sns

def getMDS(dists):
    mds = MDS(n_components=2, dissimilarity="precomputed", random_state=6)
    results = mds.fit(dists)
    return results.embedding_

def plotMDSScatter(dists, title, saveFile):
    coords = getMDS(dists)
    fig = plt.figure()
    plt.title(title)
    plt.scatter(coords[:, 0], coords[:, 1], marker = 'o')
    fig.patch.set_facecolor('white')
    for label, x, y in zip(range(len(dists)), coords[:, 0], coords[:, 1]):
        plt.annotate(label, (x, y))
    plt.savefig(saveFile, facecolor='white', edgecolor='none')
    #plt.show()

dists = json.load(open('d3/graphs_jo4_min3/bestgd_jaccard_.8_1_555-dists.json'))
plotMDSScatter(dists, 'MDS scatter of Performances of Cosmic Charlie', 'gdplots/mds-cosmiccharlie2.pdf')