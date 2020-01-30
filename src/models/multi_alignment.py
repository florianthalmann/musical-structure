import json, operator, time
import numpy as np
from profile_hmm import ProfileHMM

def load_data(path):
    with open(path) as ofile:
        loaded = json.load(ofile)
    return loaded["data"], loaded["labels"]

def create_model_from_data(data):
    lengths = [len(d) for d in data]
    median_length = int(np.median(lengths))
    init_sequence = [d for d in data if len(d) == median_length][0]
    training_data = np.array(np.delete(data, data.index(init_sequence), 0))
    print('model length', median_length, len(init_sequence))
    model = ProfileHMM(median_length, 24, init_sequence)
    print('fitting model')
    before = time.time()
    history = model.fit(data)
    print('total improvement', history.total_improvement[-1],
        'epochs', history.epochs[-1])
    print('took', round(time.time()-before), 'seconds')
    return model

def get_dist_max(dist):
    return max(dist.parameters[0], key=dist.parameters[0].get)

def print_viterbi_paths(data, model):
    for sequence in data[:10]:
        logp, path = model.viterbi(sequence)
        print(''.join( '-' if state.name[0] == 'I'
            #else str(get_dist_max(state.distribution)) if state.name[0] == 'M'
            else str(state.name[-1]) if state.name[0] == 'M'
            else ''#state.name[0]
            for idx, state in path[1:-1]))

def save_results(data, model, filepath):
    paths = [model.viterbi(d)[1] for d in data]
    msa = [[state.name if state.name[0] == 'M' else ''
        for idx, state in path[1:-1]] for path in paths]
    with open(filepath, 'w') as f:
        json.dump(msa, f)

data, labels = load_data("results/timeline-test7/meandmyuncle30-points.json")
for sequence in map(list, data[:10]):
    print(''.join(str(s) for s in sequence))
model = create_model_from_data(data)
#model.save_to_json("results/timeline-test7/meandmyuncle30-hmm.json")
#model = ProfileHMM().load_from_json("results/timeline-test7/meandmyuncle30-hmm.json")
print_viterbi_paths(data, model.model)
save_results(data, model.model, "results/timeline-test7/meandmyuncle30-msa.json")
