import sys, json, operator, time, itertools
import numpy as np
from os import path
import argparse
from profile_hmm import ProfileHMM, FlankedProfileHMM

def load_json(path):
    with open(path) as ofile:
        return json.load(ofile)

def load_data(path):
    return load_json(path)["data"]#, loaded["labels"]

def train_model_from_data(data, verbose, match_match, delete_insert,
        dist_inertia, edge_inertia, max_iterations,
        model_length_func=np.median, model_type=ProfileHMM, flank_prob=0.999999):
    target_length = int(model_length_func([len(d) for d in data]))
    #take sequence closest to target length as init sequence
    init_sequence = sorted(data, key=lambda d: abs(len(d) - target_length))[0]
    training_data = data#np.array(np.delete(data, data.index(init_sequence), 0))
    num_features = max([d for r in data for d in r])+1
    if verbose:
        print('version count', len(data))
        print('model length', len(init_sequence))
        print('num features', num_features)
    model = model_type(len(init_sequence), num_features, init_sequence,
        match_match, delete_insert, flank_prob)
    if verbose:
        print('fitting model')
    before = time.time()
    history = model.fit(data, dist_inertia, edge_inertia, max_iterations)
    if verbose:
        print('total improvement', history.total_improvement[-1],
            'epochs', history.epochs[-1])
        print('took', round(time.time()-before), 'seconds')
    return model

def get_dist_max(dist):
    return max(dist.parameters[0], key=dist.parameters[0].get)

def print_viterbi_paths(data, model):
    for sequence in data[:20]:
        logp, path = model.viterbi(sequence)
        print(''.join( '-' if state.name[0] == 'I' #or state.name[0] == 'F' #insert or flank
            else str(chr(65+(get_dist_max(state.distribution)%26))) if state.name[0] == 'M'
            #else str(chr(65+(int(state.name[1:])%61))) if state.name[0] == 'M'
            else ''#state.name[0]
            for idx, state in path[1:-1]))

def save_results(data, model, filepath):
    viterbis = [model.viterbi(d) for d in data]
    logps = [v[0] for v in viterbis]
    paths = [v[1] for v in viterbis]
    no_del = [[state.name for idx, state in path[1:-1] if state.name[0] != 'D']
        for path in paths] #remove deletes
    msa = [[s if s[0] == 'M' else '' for s in path] for path in no_del] #hide inserts
    with open(filepath, 'w') as f:
        json.dump({"msa": msa, "logp": logps}, f)

def align_song_versions(infile, outfile, match_match=0.999, delete_insert=0.01,
        max_iterations=50, dist_inertia=0.8, edge_inertia=1.0,
        verbose=True, realignTopP=0, force=False,
        model_length_func=np.median, model_type=ProfileHMM, flank_prob=0.999999):
    if force or not path.exists(outfile):
        data = load_data(infile)
        if verbose and isinstance(data[0][0], int):
            for sequence in map(list, data[:20]):
                print(''.join(str(chr(65+(s%26))) for s in sequence))
        model = train_model_from_data(data, verbose, match_match, delete_insert,
            dist_inertia, edge_inertia, max_iterations, model_length_func, model_type, flank_prob)
        #np.set_printoptions(edgeitems=10, linewidth=200)
        #print(model.model.dense_transition_matrix().round(3))
        #model.save_to_json("results/timeline-test7/meandmyuncle30-hmm.json")
        #model = ProfileHMM().load_from_json("results/timeline-test7/meandmyuncle30-hmm.json")
        print_viterbi_paths(data, model.model)
        save_results(data, model.model, outfile)
    elif not path.exists(outfile) and realignTopP > 0:
        data = load_data(infile)
        results = load_json(outfile)
        logps = results["logp"]
        top_logps = sorted(logps, reverse=True)[:int(len(logps)*realignTopP)]
        print(top_logps)
        indexes = [i for i, l in enumerate(logps) if l in top_logps]
        data = [d for i, d in enumerate(data) if i in indexes]
        model = train_model_from_data(data, verbose, match_match, delete_insert,
            inertia, max_iterations, model_length_func)
        print_viterbi_paths(data, model.model)
        save_results(data, model.model, outfile.replace(".json","RE.json"))

#align_song_versions("results/hmm-test/cosmiccharlie100", verbose=True)
#sweep_align("results/hmm-test2/cosmiccharlie100", [400], [0.0, 0.2, 0.4], [0.3, 0.4, 0.5], [0.1, 0.01, 0.001])
#sweep_align("results/hmm-test2/cosmiccharlie100", [50, 100, 200, 400], [0.0], [0.7], [0.1])
#sweep_align("results/hmm-test2/cosmiccharlie100", [200], [0.0, 0.2, 0.4], [0.5, 0.7, 0.9], [0.1])
#sweep_align("results/hmm-test2/cosmiccharlie100", [100], [0.4], [0.999], [0.001,0.01,0.1,0.2,0.3])
#sweep_align("results/hmm-test2/meandmyuncle100", [100], [0.0,0.2,0.4], [0.9,0.99,0.999], [0.001,0.01,0.1])
#sweep_align("results/hmm-test3/cosmiccharlie100", [100], [0.4,0.8], [0.5,0.7,0.9,0.999], [0.01,0.1,0.2])
#sweep_align("results/hmm-test3/cosmiccharlie100", [100], [0.4], [0.999], [0.2], realignTopP=0.3)
#align_song_versions("results/tuning-test/meandmyuncle100c0", 0.999, 0.01, 50, 0.8, verbose=True, force=True)

#align_song_versions("results/local-test2/dark_star100j0ml0", force=True,
#    model_type=FlankedProfileHMM, max_iterations=10)

parser = argparse.ArgumentParser()
parser.add_argument('infile', type=str)
parser.add_argument('outfile', type=str)
parser.add_argument('max_iterations', type=int)
parser.add_argument('model_type', type=str)
parser.add_argument('model_length_func', type=str)
parser.add_argument('edge_inertia', type=float)
parser.add_argument('dist_inertia', type=float)
parser.add_argument('match_match', type=float)
parser.add_argument('delete_insert', type=float)
parser.add_argument('flank_prob', type=float, nargs='?')
args = parser.parse_args()

def quantile(q):
    def compute(v):
        return np.quantile(v, q)
    return compute

if ('quantile' in args.model_length_func):
    length_func = quantile(float(args.model_length_func[8:]))
else:
    length_func = getattr(np, args.model_length_func)

align_song_versions(
    infile=args.infile,
    outfile=args.outfile,
    max_iterations=args.max_iterations,
    model_type=getattr(sys.modules[__name__], args.model_type),
    model_length_func=length_func,
    edge_inertia=args.edge_inertia,
    dist_inertia=args.dist_inertia,
    match_match=args.match_match,
    delete_insert=args.delete_insert,
    flank_prob=args.flank_prob)

