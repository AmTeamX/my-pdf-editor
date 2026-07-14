"""
opendataloader Standard — HTTP wrapper for PDF & image extraction.
If input is an image (JPG/PNG/etc.), auto-wraps it as a PDF first.
"""
import os, json, subprocess, logging, tempfile
from pathlib import Path
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("odl-standard")

app = FastAPI(title="OpenDataLoader Standard", version="2.1.0")
SCRIPT = Path(__file__).parent / "convert_pdf.py"

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".tiff", ".tif"}


def is_image(filepath: str) -> bool:
    """Check by extension first, then by PIL."""
    ext = os.path.splitext(filepath)[1].lower()
    if ext in IMAGE_EXTS:
        return True
    # Try magic bytes via PIL
    try:
        from PIL import Image
        Image.open(filepath).verify()
        return True
    except Exception:
        return False


def wrap_image_to_pdf(image_path: str) -> str:
    """Wrap + resize image in a single-page PDF. Returns path to temp PDF."""
    from PIL import Image
    img = Image.open(image_path)
    if img.mode in ("RGBA", "P", "LA"):
        img = img.convert("RGB")
    elif img.mode not in ("RGB", "L"):
        img = img.convert("RGB")

    # Resize large images to prevent OCR memory issues (max 2500px longest side)
    max_dim = 2500
    w, h = img.size
    if w > max_dim or h > max_dim:
        ratio = max_dim / max(w, h)
        img = img.resize((int(w * ratio), int(h * ratio)), Image.LANCZOS)
        logger.info(f"Resized image {w}x{h} → {img.size[0]}x{img.size[1]}")

    tmp = tempfile.NamedTemporaryFile(suffix=".pdf", delete=False)
    img.save(tmp.name, format="PDF")
    tmp.close()
    logger.info(f"Wrapped image {image_path} → PDF {tmp.name} ({img.size[0]}x{img.size[1]})")
    return tmp.name


class ConvertRequest(BaseModel):
    pdf_path: str


def flatten_tree(node, page_num=0):
    blocks = []
    if isinstance(node, list):
        for item in node:
            blocks.extend(flatten_tree(item, page_num))
    elif isinstance(node, dict):
        if "page number" in node:
            page_num = node["page number"]
        for key in ("kids", "children", "elements"):
            if key in node:
                blocks.extend(flatten_tree(node[key], page_num))
        t = node.get("type", "")
        c = node.get("content", "")
        if c and c.strip() and t not in ("page", "document"):
            bb = node.get("bounding box")
            blocks.append({"type": t, "page_number": page_num or 1, "bounding_box": bb, "content": c.strip()})
    return blocks


def run_converter(filepath: str):
    """Run convert_pdf.py and return parsed blocks."""
    result = subprocess.run(
        ["python3", str(SCRIPT), filepath],
        capture_output=True, text=True, timeout=120,
    )
    output = result.stdout + result.stderr

    # Try find JSON with total_blocks
    for line in output.split("\n"):
        line = line.strip()
        if line.startswith("{") and '"total_blocks"' in line:
            data = json.loads(line)
            return data.get("total_blocks", 0), data.get("blocks", [])

    # Try find raw opendataloader tree
    for line in output.split("\n"):
        line = line.strip()
        if line.startswith("{") and '"kids"' in line:
            try:
                raw = json.loads(line)
                blocks = flatten_tree(raw)
                return len(blocks), blocks
            except Exception:
                pass

    raise HTTPException(status_code=500, detail="No JSON output from converter")


@app.get("/health")
def health():
    return {"status": "ok", "script": str(SCRIPT)}


@app.post("/convert")
def convert(req: ConvertRequest):
    filepath = req.pdf_path
    if not os.path.exists(filepath):
        raise HTTPException(status_code=400, detail=f"File not found: {filepath}")

    wrapped_pdf = None
    try:
        # Auto-wrap images as PDF
        if is_image(filepath):
            wrapped_pdf = wrap_image_to_pdf(filepath)
            filepath = wrapped_pdf

        logger.info(f"Converting: {filepath}")
        total, blocks = run_converter(filepath)
        return {"total_blocks": total, "blocks": blocks}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if wrapped_pdf and os.path.exists(wrapped_pdf):
            os.unlink(wrapped_pdf)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
