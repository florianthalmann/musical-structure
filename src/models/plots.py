import json
import pandas as pd
from matplotlib import pyplot as plt

path = "results/hmm-test2/meandmyuncle100-ratings.json"

with open(path) as f:
    data = pd.DataFrame(json.load(f))

#data = data[~data[0].str.contains('MAX')]
data = data[data[0].str.contains('100')]
#data = data[data[0] == '100']
data = data[data[1] < '0.4']
data = data[data[2] == '0.999']
data = data[data[3] == '0.1']

print(data)
#data.groupby([1,0]).mean().unstack().plot()
data.groupby([0]).mean().unstack().plot()
#data.plot()



plt.show()