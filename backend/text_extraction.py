import io
import tempfile
from pathlib import Path
from typing import Optional

import pdfplumber
from docx import Document
from bs4 import BeautifulSoup


def extract_text_from_file(file_bytes: bytes, filename: str) -> Optional[str]:
    """Extract text from uploaded file based on extension.

    Supports: PDF, DOCX, DOC (basic), HTML, TXT.
    Returns None if extraction fails or unsupported format.
    """
    ext = Path(filename).suffix.lower()

    try:
        if ext == '.pdf':
            return _extract_pdf(file_bytes)
        elif ext == '.docx':
            return _extract_docx(file_bytes)
        elif ext == '.doc':
            # Basic DOC support - treat as text if possible, else skip
            try:
                return file_bytes.decode('utf-8', errors='ignore')
            except:
                return None
        elif ext == '.html':
            return _extract_html(file_bytes)
        elif ext == '.txt':
            return file_bytes.decode('utf-8', errors='ignore')
        else:
            return None
    except Exception as e:
        print(f"Error extracting text from {filename}: {e}")
        return None


def _extract_pdf(file_bytes: bytes) -> Optional[str]:
    """Extract text from PDF using pdfplumber."""
    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        text = ""
        for page in pdf.pages:
            page_text = page.extract_text()
            if page_text:
                text += page_text + "\n"
        return text.strip() if text else None


def _extract_docx(file_bytes: bytes) -> Optional[str]:
    """Extract text from DOCX using python-docx."""
    with tempfile.NamedTemporaryFile(suffix='.docx', delete=False) as tmp:
        tmp.write(file_bytes)
        tmp.flush()
        try:
            doc = Document(tmp.name)
            text = "\n".join([para.text for para in doc.paragraphs if para.text])
            return text.strip() if text else None
        finally:
            Path(tmp.name).unlink()


def _extract_html(file_bytes: bytes) -> Optional[str]:
    """Extract text from HTML using BeautifulSoup."""
    html = file_bytes.decode('utf-8', errors='ignore')
    soup = BeautifulSoup(html, 'html.parser')
    # Remove script and style elements
    for script in soup(["script", "style"]):
        script.extract()
    text = soup.get_text()
    # Clean up whitespace
    lines = (line.strip() for line in text.splitlines())
    chunks = (phrase.strip() for line in lines for phrase in line.split("  "))
    text = ' '.join(chunk for chunk in chunks if chunk)
    return text if text else None