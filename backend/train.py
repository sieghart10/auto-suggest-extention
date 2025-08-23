from core.ngrams import NgramModel

def main():
    model = NgramModel()
    # ["data/poet-en.txt", "data/std-en.txt", "data/poet-en.txt"]
    file_paths = ["data/std-en.txt"]
    model.train_from_files(file_paths)
    model.save_model("std-en.pkl")

if __name__ == "__main__":
    main()