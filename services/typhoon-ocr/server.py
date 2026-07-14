"""
Typhoon OCR HTTP Service — uses OpenTyphoon vision model for OCR.
"""
import os, json, base64, logging
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import httpx

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("typhoon-ocr")

app = FastAPI(title="Typhoon OCR", version="1.0.0")

API_URL = os.getenv("TYPHOON_API_URL", "https://api.opentyphoon.ai/v1")
MODEL = os.getenv("TYPHOON_MODEL", "typhoon-ocr")
API_KEY = os.getenv("TYPHOON_API_KEY", "")


class OCRRequest(BaseModel):
    pdf_path: str
    language: str = "auto"


@app.get("/health")
def health():
    return {"status": "ok", "model": MODEL}


@app.post("/ocr")
async def ocr(req: OCRRequest):
    if not os.path.exists(req.pdf_path):
        raise HTTPException(status_code=400, detail=f"File not found: {req.pdf_path}")

    try:
        # Convert first page of PDF to image
        import subprocess, tempfile
        img_dir = tempfile.mkdtemp(prefix="ocr_img_")
        subprocess.run(
            ["pdftoppm", "-png", "-r", "200", "-f", "1", "-l", "5", req.pdf_path, f"{img_dir}/page"],
            capture_output=True, timeout=60, check=True,
        )

        pages = []
        image_files = sorted([f for f in os.listdir(img_dir) if f.endswith(".png")])
        for i, img_file in enumerate(image_files):
            with open(os.path.join(img_dir, img_file), "rb") as f:
                img_b64 = base64.b64encode(f.read()).decode()

            async with httpx.AsyncClient(timeout=60) as client:
                resp = await client.post(
                    f"{API_URL}/chat/completions",
                    headers={"Authorization": f"Bearer {API_KEY}"} if API_KEY else {},
                    json={
                        "model": MODEL,
                        "messages": [{
                            "role": "user",
                            "content": [
                                {"type": "text", "text": "Extract all text from this document page. Return the text exactly as it appears, preserving structure."},
                                {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{img_b64}"}},
                            ]
                        }],
                        "max_tokens": 2000,
                    },
                )
            if resp.status_code == 200:
                data = resp.json()
                markdown = data["choices"][0]["message"]["content"]
                pages.append({"page_number": i + 1, "content": markdown, "raw_markdown": markdown})

        return {"total_pages": len(pages), "pages": pages}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8100)
