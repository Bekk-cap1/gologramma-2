"""Depth Anything V2 inference wrapper (optional; graceful fallback when transformers absent).

The HF pipeline (and its weights) is cached module-level so repeated calls don't
reload the ~100MB model. Uses CUDA when available.
"""
from .postprocess import normalize_depth

_PIPE_CACHE = {}


def _get_pipe(model_id):
    """Return a cached depth-estimation pipeline for ``model_id`` (built once)."""
    pipe = _PIPE_CACHE.get(model_id)
    if pipe is None:
        import torch
        from transformers import pipeline
        device = 0 if torch.cuda.is_available() else -1
        pipe = pipeline(task="depth-estimation", model=model_id, device=device)
        _PIPE_CACHE[model_id] = pipe
    return pipe


def run_depth_anything(image, model_id="depth-anything/Depth-Anything-V2-Small-hf"):
    """Run Depth Anything V2 on ``image`` (H x W x 3 uint8 RGB).

    Lazily imports torch/transformers so an absent install raises ImportError
    that the caller catches and falls back from. Returns
    ``{"depth": HxW float32 [0,1], "method": "depth_anything_v2"}``.
    """
    import numpy as np
    from PIL import Image as PILImage

    h, w = image.shape[:2]
    pil_image = PILImage.fromarray(image)

    pipe = _get_pipe(model_id)
    output = pipe(pil_image)

    if hasattr(output, "predicted_depth"):
        raw = output.predicted_depth
    elif isinstance(output, dict):
        raw = output.get("predicted_depth", output.get("depth"))
    else:
        raw = output

    # torch tensor (possibly on GPU) -> numpy
    if hasattr(raw, "detach"):
        raw = raw.detach().cpu().numpy()
    elif hasattr(raw, "numpy"):
        raw = raw.numpy()
    raw = np.asarray(raw, dtype=np.float32).squeeze()

    from skimage.transform import resize as sk_resize
    if raw.shape != (h, w):
        raw = sk_resize(raw, (h, w), order=1, preserve_range=True,
                        anti_aliasing=True).astype(np.float32)

    return {"depth": normalize_depth(raw), "method": "depth_anything_v2"}
