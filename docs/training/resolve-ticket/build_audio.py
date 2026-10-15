# Narration: Kokoro (local neural TTS). Usage: venv/bin/python build_audio.py <workdir> <kokoro.onnx> <voices.bin>
import json,subprocess,os,sys,soundfile as sf
from kokoro_onnx import Kokoro
d=os.path.dirname(os.path.abspath(__file__));work,model,voices=sys.argv[1:4];os.makedirs(work,exist_ok=True)
VOICE=os.environ.get('VOICE','af_heart');SPEED=float(os.environ.get('SPEED','1.0'))
k=Kokoro(model,voices)
import re
_dd=os.path.join(os.path.dirname(__import__('misaki').__file__),'data')
_g=json.load(open(_dd+'/us_gold.json'));_s=json.load(open(_dd+'/us_silver.json'))
# espeak is unusable on this machine, so text -> phonemes comes from misaki's lexicon (Kokoro's own phoneme set)
OVR={"here's":"hˈɪɹz","that's":"ðˈæts","receipts":"ɹəsˈits","recordings":"ɹəkˈɔɹdɪŋz","screenshots":"skɹˈinʃˌɑts","ups":"ˈʌps"}
def _look(w):
    if w in OVR: return OVR[w]
    for dct in (_g,_s):
        v=dct.get(w) or dct.get(w.capitalize())
        if v: return v if isinstance(v,str) else (v.get('DEFAULT') or list(v.values())[0])
    raise SystemExit('no phonemes for '+w)
def phon(text):
    out=[]
    for tok in re.findall(r"[A-Za-z']+|[.,:;!?]",text):
        out.append(tok if tok in '.,:;!?' else ' '+_look(tok.lower()))
    return ''.join(out).strip()
beats=json.load(open(f'{d}/narration.json'));t=0.4;B={};D={};parts=[]
for i,(bid,text,gap) in enumerate(beats):
    w=f'{work}/{bid}.wav'
    s,sr=k.create(phon(text),voice=VOICE,speed=SPEED,lang='en-us',is_phonemes=True);sf.write(w,s,sr)
    dur=len(s)/sr;t+=gap if i else 0
    B[bid]=round(t,3);D[bid]=round(dur,3);parts.append((t,w));t+=dur
LOGO=round(t+0.7,2);total=round(LOGO+4.6,2)
cmd=['ffmpeg','-y','-loglevel','error'];flt=[]
for i,(st,w) in enumerate(parts):
    cmd+=['-i',w];flt.append(f'[{i}]aresample=44100,adelay={int(st*1000)}:all=1[a{i}]')
flt.append(''.join(f'[a{i}]' for i in range(len(parts)))+f'amix=inputs={len(parts)}:normalize=0,apad=whole_dur={total}[o]')
cmd+=['-filter_complex',';'.join(flt),'-map','[o]','-t',str(total),f'{work}/narration.wav']
subprocess.run(cmd,check=True)
open(f'{d}/timings.js','w').write('window.B='+json.dumps(B)+';window.D='+json.dumps(D)+';window.TOTAL='+str(total)+';window.LOGO='+str(LOGO)+';window.T='+json.dumps({b[0]:b[1] for b in beats})+';')
print('total',total,'logo',LOGO);print(B);print(D)
