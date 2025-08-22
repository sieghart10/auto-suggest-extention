import os
import sys
import re
import math
import pickle
from collections import defaultdict, Counter
from typing import List, Dict, Tuple, Optional, Union

class NgramModel:
    def __init__(self, model_data: Optional[Dict] = None):
        if model_data:
            self.load_from_dict(model_data)
        else:
            self.unigrams = Counter()
            self.bigrams = defaultdict(Counter)
            self.trigrams = defaultdict(Counter)
            self.vocab_size = 0
            self.total_tokens = 0
            self.is_trained = False
            
            # toy corpus
            self.training_data = [
                "Dear Sir or Madam I am writing to inquire about your services",
                "Thank you for your email I look forward to hearing from you",
                "I hope this email finds you well Please let me know if you need anything",
                "Best regards and thank you for your time",
                "I would like to schedule a meeting to discuss this further",
                "Please find attached the document you requested",
                "I am writing to follow up on our previous conversation",
                "Could you please provide more information about this matter",
                "I appreciate your prompt response to my inquiry",
                "Let me know if you have any questions or concerns",
                "I am looking forward to your reply",
                "Thank you for considering my request",
                "I would be happy to provide additional details if needed",
                "Please feel free to contact me if you need clarification",
                "I hope we can work together on this project"
            ]
            
            # if not model_data:
            #     self.train()
    
    def load_from_dict(self, model_data: Dict):
        """Load model from dictionary structure"""
        if 'trigrams' in model_data:
            # Convert defaultdict structure
            self.trigrams = defaultdict(Counter)
            for key, counter in model_data['trigrams'].items():
                if isinstance(key, tuple):
                    self.trigrams[key] = Counter(counter)
                else:
                    if isinstance(key, str) and ' ' in key:
                        tuple_key = tuple(key.split())
                        self.trigrams[tuple_key] = Counter(counter)
                    else:
                        self.trigrams[key] = Counter(counter)
        
        if 'bigrams' in model_data:
            self.bigrams = defaultdict(Counter)
            for key, counter in model_data['bigrams'].items():
                if isinstance(key, tuple):
                    self.bigrams[key] = Counter(counter)
                else:
                    if isinstance(key, str):
                        if key.endswith(','):
                            tuple_key = (key.rstrip(','),)
                        else:
                            tuple_key = (key,) if not ' ' in key else tuple(key.split())
                        self.bigrams[tuple_key] = Counter(counter)
                    else:
                        self.bigrams[key] = Counter(counter)
        
        if 'unigrams' in model_data:
            self.unigrams = Counter()
            for key, count in model_data['unigrams'].items():
                if isinstance(key, tuple):
                    self.unigrams[key] = count
                else:
                    tuple_key = (key,) if isinstance(key, str) else key
                    self.unigrams[tuple_key] = count
        
        self.vocab_size = model_data.get('vocab_size', len(self.unigrams))
        self.total_tokens = model_data.get('total_tokens', sum(self.unigrams.values()))
        self.is_trained = True
        
        print(f'Loaded N-gram model with vocabulary size: {self.vocab_size}')
        print(f'Total tokens: {self.total_tokens}')
    
    def normalize(self, text: str) -> str:
        return re.sub(r'[^\w\s]', '', text.lower()).strip()
    
    def tokenize(self, text: str, special_tokens: bool = True) -> List[str]:
        if not text.strip():
            return []
        
        # Split on whitespace and various punctuation
        tokens = re.split(r'[\s—\-\']+', text)
        tokens = [self.normalize(t) for t in tokens if t.strip()]
        tokens = [t for t in tokens if t]  # Remove empty tokens
        
        if special_tokens:
            return ['<s>'] + tokens + ['</s>']
        return tokens
    
    def generate_ngrams(self, tokens: List[str], n: int = 3) -> Dict[Tuple[str, ...], int]:
        ngrams = defaultdict(int)
        sentence = []
        total_tokens = len(tokens)
        
        # only show progress for large datasets
        show_progress = total_tokens > 10000
        if show_progress:
            print(f"Generating {n}-grams from {total_tokens:,} tokens...")
            update_freq = max(1, total_tokens // 100)
        
        for i, token in enumerate(tokens):
            sentence.append(token)
            
            if token == '</s>':
                if len(sentence) >= n:
                    for j in range(len(sentence) - n + 1):
                        gram = tuple(sentence[j:j + n])
                        ngrams[gram] += 1
                sentence = []
            
            if show_progress and (i % update_freq == 0 or i == total_tokens - 1):
                percent = (i + 1) / total_tokens
                bar_length = 30
                filled_length = int(bar_length * percent)
                bar = "█" * filled_length + "░" * (bar_length - filled_length)
                sys.stdout.write(f"\r  [{bar}] {percent:.0%} ({i+1:,}/{total_tokens:,})")
                sys.stdout.flush()
        
        if show_progress:
            print(f"\n  ✓ Generated {len(ngrams):,} unique {n}-grams")
        
        return dict(ngrams)
    
    def create_freq_table(self, ngrams: Dict[Tuple[str, ...], int], n: int = 3) -> Union[Dict, defaultdict]:
        if n == 1:
            return Counter({gram: count for gram, count in ngrams.items()})
        
        freq = defaultdict(Counter)
        
        for gram, count in ngrams.items():
            if len(gram) == n:
                prefix = gram[:-1]
                next_word = gram[-1]
                freq[prefix][next_word] = count
        
        return freq
    
    def train(self, training_data: Optional[List[str]] = None):
        if training_data:
            self.training_data = training_data
        
        all_tokens = []
        total_samples = len(self.training_data)
        print(f"Processing {total_samples} training samples...")

        bar_length = 40

        for i, text in enumerate(self.training_data, start=1):
            tokens = self.tokenize(text)
            all_tokens.extend(tokens)

            # Update progress bar
            if i % 1000 == 0 or i == total_samples:
                percent = i / total_samples
                filled_length = int(bar_length * percent)
                bar = "=" * filled_length + "-" * (bar_length - filled_length)
                sys.stdout.write(f"\r[{bar}] {percent:.0%} ({i}/{total_samples})")
                sys.stdout.flush()

        print()

        print("Building n-gram models...")
        trigram_counts = self.generate_ngrams(all_tokens, 3)
        bigram_counts = self.generate_ngrams(all_tokens, 2)
        unigram_counts = self.generate_ngrams(all_tokens, 1)
        
        self.trigrams = self.create_freq_table(trigram_counts, 3)
        self.bigrams = self.create_freq_table(bigram_counts, 2)
        self.unigrams = self.create_freq_table(unigram_counts, 1)
        
        self.vocab_size = len(self.unigrams)
        self.total_tokens = sum(self.unigrams.values())
        self.is_trained = True
        
        print(f'N-gram model trained with vocabulary size: {self.vocab_size}')
        print(f'Total tokens: {self.total_tokens}')

    def read_text_files(self, file_paths: List[str], encoding: str = 'utf-8') -> List[str]:
        training_data = []
        total_files = len(file_paths)
        
        print(f"Reading {total_files} files...")
        
        for i, file_path in enumerate(file_paths, 1):
            try:
                # Show file progress
                percent = i / total_files
                bar_length = 30
                filled_length = int(bar_length * percent)
                bar = "█" * filled_length + "░" * (bar_length - filled_length)
                
                file_name = os.path.basename(file_path)
                sys.stdout.write(f"\r[{bar}] {percent:.0%} Reading: {file_name:<30}")
                sys.stdout.flush()
                
                with open(file_path, 'r', encoding=encoding, errors='ignore') as f:
                    content = f.read()
                    
                    # Split into sentences
                    sentences = [line.strip() for line in content.split('\n') if line.strip()]
                    training_data.extend(sentences)
                    
            except Exception as e:
                print(f"\nError reading {file_path}: {e}")
                continue
        
        print(f"\n✓ Loaded {len(training_data):,} sentences from {total_files} files")
        return training_data

    def train_from_files(self, file_paths: List[str], encoding: str = 'utf-8'):
        training_data = self.read_text_files(file_paths, encoding)
        
        if not training_data:
            print("No training data found in files!")
            return
        
        print(f"Loaded {len(training_data)} sentences from {len(file_paths)} files")
        
        self.train(training_data)
    
    def get_vocabulary_size(self) -> int:
        return self.vocab_size
    
    def predict_next(self, context: str, top_k: int = 5) -> List[str]:
        if not self.is_trained:
            return []
        
        tokens = self.tokenize(context, False)
        if len(tokens) < 2:
            return []
        
        w1 = tokens[-2]
        w2 = tokens[-1]
        bigram_key = (w1, w2)
        
        probabilities = []
        
        # try trigram first
        if bigram_key in self.trigrams:
            next_words = self.trigrams[bigram_key]
            total = sum(next_words.values())
            
            for word, count in next_words.items():
                if word != '</s>':
                    prob = math.log((count + 1) / (total + self.vocab_size))
                    probabilities.append({'word': word, 'prob': prob, 'source': 'trigram'})
        
        # then try bigram
        unigram_w2 = (w2,)
        if len(probabilities) < top_k and unigram_w2 in self.bigrams:
            next_words = self.bigrams[unigram_w2]
            total = sum(next_words.values())
            
            for word, count in next_words.items():
                if word != '</s>' and not any(c['word'] == word for c in probabilities):
                    prob = math.log((count + 1) / (total + self.vocab_size))
                    probabilities.append({'word': word, 'prob': prob, 'source': 'bigram'})
        
        # finally backoff to unigram
        if len(probabilities) < top_k:
            total = sum(self.unigrams.values())
            for gram, count in self.unigrams.items():
                word = gram[0] if isinstance(gram, tuple) else gram
                if (word != '<s>' and word != '</s>' and 
                    not any(c['word'] == word for c in probabilities)):
                    prob = math.log((count + 1) / (total + self.vocab_size))
                    probabilities.append({'word': word, 'prob': prob, 'source': 'unigram'})
        
        probabilities.sort(key=lambda x: x['prob'], reverse=True)

        print(f"Top predictions: ${probabilities[:top_k]}")

        return [c['word'] for c in probabilities[:top_k]]
    
    def interpolate(self, w1: str, w2: str, w3: str, weights: List[float] = [0.1, 0.3, 0.6]) -> float:
        # P(w₃ | w₁, w₂) = λ₁ × P(w₃) + λ₂ × P(w₃ | w₂) + λ₃ × P(w₃ | w₁, w₂)
        
        # Unigram probability
        w3_tuple = (w3,)
        total_unigrams = sum(self.unigrams.values())
        prob1 = self.unigrams.get(w3_tuple, 0) / total_unigrams if total_unigrams > 0 else 0
        
        # Bigram probability
        w2_tuple = (w2,)
        unigram_w2 = self.unigrams.get(w2_tuple, 0)
        bigram_w2_w3 = self.bigrams.get(w2_tuple, Counter()).get(w3, 0)
        prob2 = bigram_w2_w3 / unigram_w2 if unigram_w2 > 0 else 0
        
        # Trigram probability
        w1_tuple = (w1,)
        bigram_w1_w2 = self.bigrams.get(w1_tuple, Counter()).get(w2, 0)
        trigram_key = (w1, w2)
        trigram_w1_w2_w3 = self.trigrams.get(trigram_key, Counter()).get(w3, 0)
        prob3 = trigram_w1_w2_w3 / bigram_w1_w2 if bigram_w1_w2 > 0 else 0
        
        return (prob1 * weights[0]) + (prob2 * weights[1]) + (prob3 * weights[2])
    
    def predict_with_interpolation(self, text: str, top_k: int = 5) -> List[str]:
        """Predict next words using linear interpolation"""
        if not self.is_trained:
            return []
        
        tokens = self.tokenize(text, False)
        print('Tokens:', tokens)
        
        if len(tokens) < 2:
            return []
        
        w1 = tokens[-2]
        w2 = tokens[-1]
        
        print('Context words:', w1, w2)
        
        vocabulary = set()
        for gram in self.unigrams:
            word = gram[0] if isinstance(gram, tuple) else gram
            if word not in ['<s>', '</s>']:
                vocabulary.add(word)
        
        print('Vocabulary size:', len(vocabulary))
        
        probabilities = []
        
        for token in vocabulary:
            prob = self.interpolate(w1, w2, token)
            if prob > 0:
                probabilities.append({'word': token, 'prob': prob})
        
        probabilities.sort(key=lambda x: x['prob'], reverse=True)
        
        print('Top predictions:', probabilities[:top_k])
        
        return [p['word'] for p in probabilities[:top_k]]
    
    def save_model(self, filepath: str):
        save_dir = 'trained_models'
        os.makedirs(save_dir, exist_ok=True)
        full_path = os.path.join(save_dir, filepath)

        model_data = {
            'trigrams': dict(self.trigrams),
            'bigrams': dict(self.bigrams), 
            'unigrams': dict(self.unigrams),
            'vocab_size': self.vocab_size,
            'total_tokens': self.total_tokens
        }
        
        with open(full_path, 'wb') as f:
            pickle.dump(model_data, f)
        
        file_size = os.path.getsize(full_path) / (1024 * 1024)  # MB
        print(f"Model saved to {full_path} ({file_size:.2f} MB)")
    
    @classmethod
    def load_model(cls, filepath: str) -> 'NgramModel':
        load_dir = 'trained_models'
        full_path = os.path.join(load_dir, filepath)

        if not os.path.exists(full_path):
            print(f"Model file {full_path} not found")
            return None
        
        with open(full_path, 'rb') as f:
            model_data = pickle.load(f)
        
        return cls(model_data)
    
    @classmethod
    def get_available_models(cls, models_dir: str = 'trained_models') -> Dict:
        available_models = {}
        
        if not os.path.exists(models_dir):
            os.makedirs(models_dir, exist_ok=True)
            return {
                "models": {},
                "total_models": 0,
                "message": "No models directory found"
            }
        
        try:
            model_files = [f for f in os.listdir(models_dir) if f.endswith('.pkl')]
            
            for model_file in model_files:
                model_path = os.path.join(models_dir, model_file)
                model_name = model_file.replace('.pkl', '')
                
                # Get basic file info
                file_stats = os.stat(model_path)
                file_size_mb = file_stats.st_size / (1024 * 1024)
                
                try:
                    with open(model_path, 'rb') as f:
                        model_data = pickle.load(f)
                    
                    available_models[model_name] = {
                        "filename": model_file,
                        "path": model_path,
                        "size_mb": round(file_size_mb, 2),
                        "vocab_size": model_data.get('vocab_size', 'Unknown'),
                        "total_tokens": model_data.get('total_tokens', 'Unknown'),
                        "last_modified": file_stats.st_mtime,
                        "status": "valid"
                    }
                    
                except Exception as e:
                    available_models[model_name] = {
                        "filename": model_file,
                        "path": model_path,
                        "size_mb": round(file_size_mb, 2),
                        "vocab_size": "Error loading",
                        "total_tokens": "Error loading",
                        "last_modified": file_stats.st_mtime,
                        "status": "corrupted",
                        "error": str(e)
                    }
            
            return {
                "models": available_models,
                "total_models": len(available_models)
            }
            
        except Exception as e:
            raise Exception(f"Failed to scan models directory: {str(e)}")


# Example usage and testing
# if __name__ == "__main__":
#     # Test with new training
    # print("=== Testing with fresh training ===")
    # model = NgramModel()
    # file_paths = ["data/cas-en.txt", "data/poet-en.txt", "data/std-en.txt"]
    # model.train_from_files(file_paths)
    
#     # Test prediction
#     context = "I am"
#     predictions = model.predict_next(context, 5)
#     print(f"Next word predictions for '{context}': {predictions}")
    
#     # Test interpolation
#     predictions_interp = model.predict_with_interpolation(context, 5)
#     print(f"Interpolation predictions for '{context}': {predictions_interp}")
    
#     # Example of loading from existing model structure
#     print("\n=== Testing with existing model structure ===")
#     # This would be your existing model_data dictionary
#     # model_existing = NgramModel(your_existing_model_data)
    
#     # Save and load test
    # print("\n=== Testing save/load ===")
    # model.save_model("all.pkl")
#     loaded_model = NgramModel.load_model("casEn.pkl")
    
#     # Test loaded model
#     context = "dear sir"
#     predictions = loaded_model.predict_next(context, 3)
#     print(f"Loaded model predictions for '{context}': {predictions}")