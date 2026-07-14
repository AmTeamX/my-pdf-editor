#!/usr/bin/env python3
"""
PDF-to-Structured-Content Converter using opendataloader-pdf.
Outputs blocks with: type, page_number, bounding_box, content.
Usage: python3 convert_pdf.py <pdf_file_path>
"""

import sys, json, os, tempfile, shutil

try:
    import opendataloader_pdf
except ImportError:
    print(json.dumps({"error": "opendataloader-pdf not installed"}))
    sys.exit(1)


def flatten_blocks(node, page_num=0):
    blocks = []
    if isinstance(node, list):
        for item in node:
            blocks.extend(flatten_blocks(item, page_num))
        return blocks
    if not isinstance(node, dict):
        return blocks
    if "page number" in node:
        page_num = node["page number"]
    for key in ("kids", "children", "elements"):
        if key in node:
            blocks.extend(flatten_blocks(node[key], page_num))
    elem_type = node.get("type", "")
    content = node.get("content", "")
    if content and content.strip() and elem_type and elem_type not in ("page", "document"):
        bb = node.get("bounding box")
        block = {"type": elem_type, "page_number": page_num or 1, "bounding_box": bb, "content": content.strip()}
        if node.get("heading level"):
            block["heading_level"] = node["heading level"]
        blocks.append(block)
    return blocks


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: convert_pdf.py <pdf_file_path>"}))
        sys.exit(1)

    pdf_path = sys.argv[1]
    if not os.path.exists(pdf_path):
        print(json.dumps({"error": f"File not found: {pdf_path}"}))
        sys.exit(1)

    output_dir = tempfile.mkdtemp(prefix="pdfconv_")
    try:
        opendataloader_pdf.convert(input_path=[pdf_path], output_dir=output_dir, format="json")
        json_files = [f for f in os.listdir(output_dir) if f.endswith(".json")]
        if not json_files:
            print(json.dumps({"error": "No output generated"}))
            sys.exit(1)
        with open(os.path.join(output_dir, json_files[0]), "r", encoding="utf-8") as f:
            data = json.load(f)
        blocks = flatten_blocks(data)
        print(json.dumps({"total_blocks": len(blocks), "blocks": blocks}, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)
    finally:
        shutil.rmtree(output_dir, ignore_errors=True)


if __name__ == "__main__":
    main()
