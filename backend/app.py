import uvicorn
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from core.ngrams import NgramModel
from typing import Optional
from datetime import datetime, timezone

ngram_model = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global ngram_model
    print("Loading N-gram model...")
    try:
        ngram_model = NgramModel.load_model("all.pkl")
        if not ngram_model:
            print("ERROR: Failed to load model. Please ensure all.pkl exists in trained_models/")
            raise RuntimeError("Model loading failed")
        print("✓ Model loaded successfully")
    except Exception as e:
        print(f"ERROR loading model: {e}")
        raise RuntimeError(f"Failed to load model: {e}")
    
    yield
    
    print("Shutting down...")

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class PredictRequest(BaseModel):
    text: str
    top_k: int = 5
    method: str = "backoff"  # or "interpolation"

class ModelSwitchRequest(BaseModel):
    model_name: str  # "all", "casual", "formal", "poetic"

class SettingsUpdateRequest(BaseModel):
    post_box: Optional[bool] = None
    search_bar: Optional[bool] = None
    comment_box: Optional[bool] = None
    chat_box: Optional[bool] = None
    prediction_method: Optional[str] = None  # "backoff" or "interpolation"
    suggestions_count: Optional[int] = None

# in memory settings for now
user_settings = {
    "post_box": True,
    "search_bar": True,
    "comment_box": True,
    "chat_box": True,
    "prediction_method": "backoff",
    "suggestions_count": 3,
    "active_model": "all",
    "extension_enabled": True
}

@app.get("/")
async def root():
    return {
        "message": "N-gram Language Model API is running!",
        "model_loaded": ngram_model is not None and ngram_model.is_trained,
        "timestamp": datetime.now(timezone.utc)
    }

@app.get("/models")
async def get_available_models():
    try:
        models_info = NgramModel.get_available_models()
        if ngram_model and ngram_model.is_trained:
            models_info["loaded_model_info"] = {
                "vocab_size": ngram_model.vocab_size,
                "total_tokens": ngram_model.total_tokens,
                "is_trained": ngram_model.is_trained
            }
        
        return models_info
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/models/switch")
async def switch_model(request: ModelSwitchRequest):
    global ngram_model
    
    try:
        model_mapping = {
            "all": "all.pkl",
            "casual": "cas-en.pkl", 
            "formal": "std-en.pkl",
            "poetic": "poet-en.pkl"
        }
        
        if request.model_name not in model_mapping:
            raise HTTPException(
                status_code=400, 
                detail=f"Invalid model name. Available models: {list(model_mapping.keys())}"
            )
        
        filename = model_mapping[request.model_name]
        new_model = NgramModel.load_model(filename)
        
        if not new_model:
            raise HTTPException(
                status_code=404,
                detail=f"Model file {filename} not found"
            )
        
        ngram_model = new_model
        user_settings["active_model"] = request.model_name
        
        return {
            "message": f"Successfully switched to {request.model_name} model",
            "model_info": {
                "vocab_size": ngram_model.vocab_size,
                "total_tokens": ngram_model.total_tokens,
                "model_name": request.model_name
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Model switch failed: {str(e)}")

@app.get("/settings")
async def get_settings():
    return user_settings

@app.post("/settings")
async def update_settings(request: SettingsUpdateRequest):
    try:
        if request.post_box is not None:
            user_settings["post_box"] = request.post_box
        if request.search_bar is not None:
            user_settings["search_bar"] = request.search_bar
        if request.comment_box is not None:
            user_settings["comment_box"] = request.comment_box
        if request.chat_box is not None:
            user_settings["chat_box"] = request.chat_box
        if request.prediction_method is not None:
            if request.prediction_method not in ["backoff", "interpolation"]:
                raise HTTPException(status_code=400, detail="Invalid prediction method")
            user_settings["prediction_method"] = request.prediction_method
        if request.suggestions_count is not None:
            if not (3 <= request.suggestions_count <= 5):
                raise HTTPException(status_code=400, detail="Suggestions count must be between 3 and 5")
            user_settings["suggestions_count"] = request.suggestions_count
        
        return {
            "message": "Settings updated successfully",
            "settings": user_settings
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Settings update failed: {str(e)}")

@app.post("/toggle")
async def toggle_extension():
    user_settings["extension_enabled"] = not user_settings["extension_enabled"]
    status = "enabled" if user_settings["extension_enabled"] else "disabled"
    
    return {
        "message": f"Extension {status}",
        "enabled": user_settings["extension_enabled"]
    }

@app.post("/predict")
async def predict(request: PredictRequest):
    if not ngram_model or not ngram_model.is_trained:
        raise HTTPException(status_code=500, detail="Model not loaded or not trained")

    if not user_settings["extension_enabled"]:
        raise HTTPException(status_code=503, detail="Extension is disabled")

    text = request.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Text input cannot be empty")
    
    top_k = max(1, min(request.top_k or user_settings["suggestions_count"], 50))
    method = request.method or user_settings["prediction_method"]

    try:
        if method.lower() == "interpolation":
            predictions = ngram_model.predict_with_interpolation(text, top_k)
        else:
            predictions = ngram_model.predict_next(text, top_k)

        return {
            "input": text,
            "top_k": top_k,
            "method": method,
            "predictions": predictions,
            "model": user_settings["active_model"]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prediction failed: {str(e)}")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)