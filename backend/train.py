from core.ngrams import NgramModel

def main():
    model = NgramModel()
    file_paths = ["data/std-en.txt"]
    model.train_from_files(file_paths)
    model.save_model("std-en.pkl")

if __name__ == "__main__":
    main()