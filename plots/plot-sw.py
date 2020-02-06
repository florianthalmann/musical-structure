import os, json, sys
import numpy as np
from matplotlib import pyplot as plt
import seaborn as sns
from glob import glob
#sns.set()

basedir = sys.argv[1] #'server/lib/output/jack57-nonit/'

#paths = [y for x in os.walk(basedir) for y in glob(os.path.join(x[0], '*.json'))]
#paths = [p for p in paths if 'sw_' in p]
paths = [y for x in os.walk(basedir) for y in glob(os.path.join(x[0], '*.json'))]
paths = [p for p in paths if 'matrix' in p]

for path in paths:
    target_path = path.replace('.json', '.pdf');
    if not os.path.exists(target_path):
        with open(path) as ofile:
            #matrix = np.array(json.load(ofile)['segmentMatrix'])
            matrix = np.array(json.load(ofile))
            #matrix = np.array(json.load(ofile)['matrices'][0]['scoreMatrix'])
            #matrix = np.sqrt(matrix)
    # mask = np.copy(matrix)
    # for i in range(len(mask)):
    #     mask[i][i] = i*3
    #     for j in range(i+1, len(mask[0])):
    #         mask[i][j] = max(i*3-(j-i), 0)
    #         mask[j][i] = max(i*3-(j-i), 0)
    # matrix = np.subtract(matrix, mask)

    #mask2 = np.vectorize(lambda x: x if x > 17 else 0)
    #masked = mask2(matrix)
        if (len(matrix) > 0):
            g = sns.heatmap(matrix, xticklabels=False, yticklabels=False, cmap=sns.cm.rocket_r)
            fig = g.get_figure()
            fig.savefig(target_path)
            fig.clf()

# print mask2(np.amax(matrix,0))
# g = sns.tsplot(np.amax(matrix,0), color=sns.cubehelix_palette())
# g.patch.set_facecolor('white')
# plt.savefig('sw_nodia_77-05-08.pdf')
