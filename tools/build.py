#!/usr/bin/env python3
"""Operator build wrapper: run the unchanged model build in offline bubblewrap."""
import argparse,hashlib,os,shutil,subprocess,tempfile
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--esbuild',required=True);p.add_argument('--node',default=shutil.which('node'));p.add_argument('--out',default='build/index.html');a=p.parse_args()
root=Path(__file__).resolve().parents[1];es=Path(a.esbuild).resolve();node=Path(a.node).resolve();out=Path(a.out).resolve()
if subprocess.check_output([str(es),'--version'],text=True).strip()!='0.28.1':raise SystemExit('Requires esbuild 0.28.1')
if out.exists():raise SystemExit('Output already exists; choose a new output path')
with tempfile.TemporaryDirectory(prefix='usgs-build-') as d:
 work=Path(d)/'work';shutil.copytree(root/'source',work);(work/'provided-tools').mkdir();shutil.copy2(es,work/'provided-tools/esbuild')
 cmd=['bwrap','--unshare-all','--die-with-parent','--new-session','--cap-drop','ALL','--clearenv','--ro-bind','/usr','/usr','--symlink','usr/bin','/bin','--symlink','usr/lib','/lib','--symlink','usr/lib64','/lib64','--proc','/proc','--dev','/dev','--tmpfs','/tmp','--dir','/home/sandbox','--ro-bind',str(node),'/node','--bind',str(work),'/work','--setenv','HOME','/home/sandbox','--setenv','PATH','/usr/bin:/bin','--chdir','/work','/node','/work/build-single-file.mjs']
 subprocess.run(cmd,check=True,timeout=120)
 built=work/'app/index.html';digest=hashlib.sha256(built.read_bytes()).hexdigest();expected=hashlib.sha256((root/'index.html').read_bytes()).hexdigest()
 out.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(built,out)
 print('sha256:',digest,'matches distributed HTML:',digest==expected)
 if digest!=expected:raise SystemExit('Build differs; inspect before using it as a reproduction')
