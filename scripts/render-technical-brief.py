from pathlib import Path
from reportlab.platypus import SimpleDocTemplate,Paragraph,Spacer,PageBreak
from reportlab.lib.styles import getSampleStyleSheet,ParagraphStyle
from reportlab.lib.colors import HexColor
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
pdfmetrics.registerFont(TTFont("DejaVu", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"))
pdfmetrics.registerFont(TTFont("DejaVu-Bold", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"))
from xml.sax.saxutils import escape
root=Path(__file__).resolve().parent.parent;out=root/'output/pdf';out.mkdir(parents=True,exist_ok=True)
styles=getSampleStyleSheet()
styles.add(ParagraphStyle(name='BriefBody',fontName='DejaVu',fontSize=9.5,leading=13.2,spaceAfter=7,textColor=HexColor('#243a34')))
styles.add(ParagraphStyle(name='BriefTitle',fontName='DejaVu-Bold',fontSize=22,leading=26,spaceAfter=8,textColor=HexColor('#164e40')))
styles.add(ParagraphStyle(name='BriefH2',fontName='DejaVu-Bold',fontSize=15,leading=19,spaceBefore=9,spaceAfter=9,textColor=HexColor('#164e40')))
styles.add(ParagraphStyle(name='BriefH3',fontName='DejaVu-Bold',fontSize=10.8,leading=14,spaceBefore=7,spaceAfter=5,textColor=HexColor('#164e40')))
story=[]
for part in (root/'TECHNICAL_BRIEF.md').read_text().split('\n\n'):
 part=part.strip()
 if not part:continue
 if part=='<!-- PAGE BREAK -->':story.append(PageBreak());continue
 if part.startswith('# '):
  lines=part.split('\n');story.append(Paragraph(escape(lines[0][2:]),styles['BriefTitle']))
  for line in lines[1:]:story.append(Paragraph(escape(line),styles['BriefBody']))
 elif part.startswith('## '):story.append(Paragraph(escape(part[3:]),styles['BriefH2']))
 elif part.startswith('### '):story.append(Paragraph(escape(part[4:]),styles['BriefH3']))
 else:story.append(Paragraph(escape(part),styles['BriefBody']))
def footer(c,d):
 c.setStrokeColor(HexColor('#d9e5df'));c.line(42,40,A4[0]-42,40);c.setFont('DejaVu',8);c.setFillColor(HexColor('#526b61'));c.drawString(42,27,'NIGHTINGALE SHARED CARE | Synthetic prototype');c.drawRightString(A4[0]-42,27,f'{d.page} / 3')
SimpleDocTemplate(str(out/'technical-brief.pdf'),pagesize=A4,rightMargin=42,leftMargin=42,topMargin=34,bottomMargin=50,title='Nightingale Shared Care - Technical Brief',author='Nightingale Shared Care').build(story,onFirstPage=footer,onLaterPages=footer)
from pypdf import PdfReader
r=PdfReader(out/'technical-brief.pdf');print('Pages:',len(r.pages));assert len(r.pages)==3
