import os, json, sys
import numpy as np
from matplotlib import pyplot as plt
import seaborn as sns
#sns.set()

matrixdir = sys.argv[1] #'server/lib/output/jack57-nonit/'

for file in os.listdir(matrixdir):
    if file.endswith('.json'):
        path = os.path.join(matrixdir, file)
        with open(path) as ofile:
            matrix = np.array(json.load(ofile))
    # mask = np.copy(matrix)
    # for i in range(len(mask)):
    #     mask[i][i] = i*3
    #     for j in range(i+1, len(mask[0])):
    #         mask[i][j] = max(i*3-(j-i), 0)
    #         mask[j][i] = max(i*3-(j-i), 0)
    # matrix = np.subtract(matrix, mask)

#mask2 = np.vectorize(lambda x: x if x > 17 else 0)
#masked = mask2(matrix)
        g = sns.heatmap(matrix, xticklabels=False, yticklabels=False)
        fig = g.get_figure()
        fig.savefig(path.replace('.json', '.png'))
        fig.clf()

# print mask2(np.amax(matrix,0))
# g = sns.tsplot(np.amax(matrix,0), color=sns.cubehelix_palette())
# g.patch.set_facecolor('white')
# plt.savefig('sw_nodia_77-05-08.pdf')