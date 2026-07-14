"""
OpenDataLoader Hybrid — HTTP wrapper that calls opendataloader in hybrid mode.
Provides /convert endpoint compatible with the backend.
"""
import os, json, subprocess, logging, tempfile, shutil
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("odl-hybrid")

app = FastAPI(title="OpenDataLoader Hybrid", version="2.0.0")


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


@app.get("/health")
def health():
    return {"status": "ok", "mode": "hybrid"}


@app.post("/convert")
def convert(req: ConvertRequest):
    if not os.path.exists(req.pdf_path):
        raise HTTPException(status_code=400, detail=f"File not found: {req.pdf_path}")

    output_dir = tempfile.mkdtemp(prefix="odl_hyb_")
    try:
        cmd = [
            "opendataloader-pdf",
            "--hybrid", "docling-fast",
            "--hybrid-mode", "full",
            req.pdf_path,
            "-f", "json",
            "--output-dir", output_dir,
        ]
        logger.info(f"Running: {' '.join(cmd)}")
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)

        if result.returncode != 0:
            err = result.stderr[:500] if result.stderr else "unknown error"
            raise HTTPException(status_code=500, detail=f"Hybrid conversion failed: {err}")

        json_files = [f for f in os.listdir(output_dir) if f.endswith(".json")]
        if not json_files:
            raise HTTPException(status_code=500, detail="No JSON output")

        with open(os.path.join(output_dir, json_files[0]), "r", encoding="utf-8") as f:
            data = json.load(f)

        blocks = flatten_tree(data)
        logger.info(f"Hybrid extracted {len(blocks)} blocks")
        return {"total_blocks": len(blocks), "blocks": blocks}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        shutil.rmtree(output_dir, ignore_errors=True)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5002)
