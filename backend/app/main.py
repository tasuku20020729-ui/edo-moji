import os, uuid, base64
from pathlib import Path
from typing import Optional
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import numpy as np
import cv2
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader

OUTPUT_DIR = Path(os.getenv("OUTPUT_DIR", "outputs")); OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
PUBLIC_BASE_URL = os.getenv("PUBLIC_BASE_URL", "http://localhost:8000").rstrip("/")
API_TOKEN = os.getenv("GENERATE_API_TOKEN", "")
FONT_PATH = os.getenv("EDO_FONT_PATH", "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc")

app = FastAPI(title="Edo Moji Generator API", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
app.mount("/outputs", StaticFiles(directory=str(OUTPUT_DIR)), name="outputs")

class GenerateRequest(BaseModel):
    text: str = Field(min_length=1, max_length=80)
    style: str = "edo-yose"
    size: int = Field(default=1024, ge=512, le=1536)
    seed: int = 1234
    use_ai: bool = False


def auth(authorization: Optional[str]):
    if API_TOKEN and API_TOKEN != "change-me":
        if authorization != f"Bearer {API_TOKEN}":
            raise HTTPException(status_code=401, detail="Unauthorized")


def load_font(size:int):
    candidates=[FONT_PATH,"/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc","/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"]
    for p in candidates:
        try:
            return ImageFont.truetype(p, size=size)
        except Exception:
            continue
    return ImageFont.load_default()


def make_draft(text:str, size:int, style:str)->Image.Image:
    img=Image.new("RGB",(size,size),"white"); draw=ImageDraw.Draw(img)
    font_size=int(size*0.22 if len(text)<=4 else size*0.16)
    font=load_font(font_size)
    lines=[]; max_per_line=4 if len(text)<=8 else 5
    for i in range(0,len(text),max_per_line): lines.append(text[i:i+max_per_line])
    line_h=int(font_size*1.08); total_h=line_h*len(lines)
    y=(size-total_h)//2
    for line in lines:
        bbox=draw.textbbox((0,0),line,font=font,stroke_width=int(font_size*.05))
        x=(size-(bbox[2]-bbox[0]))//2
        sw=int(font_size*(0.08 if style=="edo-yose" else 0.12))
        draw.text((x,y),line,font=font,fill="black",stroke_width=sw,stroke_fill="black")
        y+=line_h
    return img


def opencv_finish(img:Image.Image, style:str)->Image.Image:
    gray=cv2.cvtColor(np.array(img), cv2.COLOR_RGB2GRAY)
    _,th=cv2.threshold(gray,230,255,cv2.THRESH_BINARY_INV)
    ksize=9 if style=="bold-sign" else 5
    kernel=cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(ksize,ksize))
    th=cv2.dilate(th,kernel,iterations=1)
    th=cv2.morphologyEx(th,cv2.MORPH_CLOSE,kernel,iterations=1)
    # add subtle hand-written roughness
    noise=np.random.default_rng(42).normal(0,8,th.shape).astype(np.int16)
    rough=np.clip(th.astype(np.int16)+noise,0,255).astype(np.uint8)
    out=255-rough
    rgb=cv2.cvtColor(out,cv2.COLOR_GRAY2RGB)
    return Image.fromarray(rgb).filter(ImageFilter.SHARPEN)


def make_control_canny(img:Image.Image)->Image.Image:
    arr=cv2.cvtColor(np.array(img),cv2.COLOR_RGB2GRAY)
    edges=cv2.Canny(arr,100,200)
    return Image.fromarray(cv2.cvtColor(edges,cv2.COLOR_GRAY2RGB))


def ai_generate_or_fallback(draft:Image.Image, req:GenerateRequest)->tuple[Image.Image,str]:
    if not req.use_ai:
        return opencv_finish(draft, req.style), "opencv"
    try:
        # Optional GPU path. Set ENABLE_DIFFUSERS=1 and install torch/diffusers packages.
        if os.getenv("ENABLE_DIFFUSERS") != "1":
            raise RuntimeError("Diffusers disabled")
        import torch
        from diffusers import StableDiffusionControlNetPipeline, ControlNetModel
        control_model=os.getenv("CONTROLNET_MODEL","lllyasviel/sd-controlnet-canny")
        base_model=os.getenv("BASE_MODEL","runwayml/stable-diffusion-v1-5")
        lora_path=os.getenv("USER_LORA_PATH","")
        controlnet=ControlNetModel.from_pretrained(control_model, torch_dtype=torch.float16)
        pipe=StableDiffusionControlNetPipeline.from_pretrained(base_model, controlnet=controlnet, torch_dtype=torch.float16).to("cuda")
        if lora_path: pipe.load_lora_weights(lora_path)
        control=make_control_canny(draft)
        prompt=f"edo moji japanese calligraphy, bold black ink, white background, exact text: {req.text}"
        image=pipe(prompt, image=control, num_inference_steps=25, generator=torch.Generator(device="cuda").manual_seed(req.seed)).images[0]
        return opencv_finish(image.resize((req.size,req.size)), req.style), "controlnet_lora"
    except Exception:
        return opencv_finish(draft, req.style), "fallback_opencv"


def make_pdf(img_path:Path, pdf_path:Path, text:str):
    c=canvas.Canvas(str(pdf_path), pagesize=A4); w,h=A4
    c.setTitle(f"Edo Moji - {text}")
    margin=50; max_w=w-margin*2; max_h=h-margin*2
    c.drawImage(ImageReader(str(img_path)), margin, (h-max_w)/2, width=max_w, height=max_w, preserveAspectRatio=True, mask='auto')
    c.showPage(); c.save()

@app.get("/health")
def health(): return {"ok": True}

@app.post("/generate")
def generate(req:GenerateRequest, authorization: Optional[str]=Header(default=None)):
    auth(authorization)
    job=uuid.uuid4().hex[:12]
    draft=make_draft(req.text, req.size, req.style)
    final, mode=ai_generate_or_fallback(draft, req)
    png_path=OUTPUT_DIR/f"{job}.png"; pdf_path=OUTPUT_DIR/f"{job}.pdf"
    final.save(png_path); make_pdf(png_path, pdf_path, req.text)
    return {"job_id":job,"mode":mode,"preview_png":f"{PUBLIC_BASE_URL}/outputs/{png_path.name}","pdf_url":f"{PUBLIC_BASE_URL}/outputs/{pdf_path.name}"}
