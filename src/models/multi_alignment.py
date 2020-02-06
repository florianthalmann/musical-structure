import json, operator, time, itertools
import numpy as np
from os import path
from profile_hmm import ProfileHMM

def load_json(path):
    with open(path) as ofile:
        return json.load(ofile)

def load_data(path):
    return load_json(path)["data"]#, loaded["labels"]

def train_model_from_data(data, verbose, match_match, delete_insert,
        inertia, max_iterations, model_length_func=np.median):
    target_length = int(model_length_func([len(d) for d in data]))
    #take sequence closest to target length as init sequence
    init_sequence = sorted(data, key=lambda d: abs(len(d) - target_length))[0]
    training_data = np.array(np.delete(data, data.index(init_sequence), 0))
    print('model length', len(init_sequence))
    if verbose:
        print('version count', len(data))
        print('model length', len(init_sequence))
    model = ProfileHMM(len(init_sequence), 24, init_sequence,
        match_match, delete_insert)
    if verbose:
        print('fitting model')
    before = time.time()
    history = model.fit(data, inertia, max_iterations)
    if verbose:
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
    viterbis = [model.viterbi(d) for d in data]
    logps = [v[0] for v in viterbis]
    paths = [v[1] for v in viterbis]
    msa = [[state.name if state.name[0] == 'M' else ''
        for idx, state in path[1:-1]] for path in paths]
    with open(filepath, 'w') as f:
        json.dump({"msa": msa, "logp": logps}, f)

def align_song_versions(filebase, match_match, delete_insert,
        max_iterations, inertia, label="", verbose=False, realignTopP=0):
    target_path = filebase+"-msa"+label+".json";
    if not path.exists(target_path):
        data = load_data(filebase+"-points.json")
        if verbose:
            for sequence in map(list, data[:10]):
                print(''.join(str(s) for s in sequence))
        model = train_model_from_data(data, verbose, match_match, delete_insert,
            inertia, max_iterations, np.median)
        #model.save_to_json("results/timeline-test7/meandmyuncle30-hmm.json")
        #model = ProfileHMM().load_from_json("results/timeline-test7/meandmyuncle30-hmm.json")
        print_viterbi_paths(data, model.model)
        save_results(data, model.model, target_path)
    elif realignTopP > 0:
        data = load_data(filebase+"-points.json")
        results = load_json(target_path)
        logps = results["logp"]
        top_logps = sorted(logps, reverse=True)[:int(len(logps)*realignTopP)]
        print(top_logps)
        indexes = [i for i, l in enumerate(logps) if l in top_logps]
        data = [d for i, d in enumerate(data) if i in indexes]
        model = train_model_from_data(data, verbose, match_match, delete_insert,
            inertia, max_iterations, np.median)
        print_viterbi_paths(data, model.model)
        save_results(data, model.model, filebase+"-msa"+label+"RE.json")

def sweep_align(filebase, iterations, inertias, match_matches, delete_inserts, realignTopP):
    params = [iterations, inertias, match_matches, delete_inserts]
    for i, n, m, d in itertools.product(*params):
        label = ""+str(i)+"-"+str(n)+"-"+str(m)+"-"+str(d)
        print("aligning", i, n, m, d)
        align_song_versions(filebase, m, d, i, n, label, realignTopP=realignTopP)

#align_song_versions("results/hmm-test/cosmiccharlie100", verbose=True)
#sweep_align("results/hmm-test2/cosmiccharlie100", [400], [0.0, 0.2, 0.4], [0.3, 0.4, 0.5], [0.1, 0.01, 0.001])
#sweep_align("results/hmm-test2/cosmiccharlie100", [50, 100, 200, 400], [0.0], [0.7], [0.1])
#sweep_align("results/hmm-test2/cosmiccharlie100", [200], [0.0, 0.2, 0.4], [0.5, 0.7, 0.9], [0.1])
#sweep_align("results/hmm-test2/cosmiccharlie100", [100], [0.4], [0.999], [0.001,0.01,0.1,0.2,0.3])
#sweep_align("results/hmm-test2/meandmyuncle100", [100], [0.0,0.2,0.4], [0.9,0.99,0.999], [0.001,0.01,0.1])
#sweep_align("results/hmm-test3/cosmiccharlie100", [100], [0.4,0.8], [0.5,0.7,0.9,0.999], [0.01,0.1,0.2])
sweep_align("results/hmm-test3/cosmiccharlie100", [100], [0.4], [0.999], [0.2], realignTopP=0.3)


